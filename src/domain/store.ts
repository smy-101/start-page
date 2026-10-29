import type {
  Bookmark,
  BookmarkId,
  BookmarkState,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
  StorageAdapter,
} from "./types";
import {
  createInboxGroup,
  INBOX_GROUP_ID,
  nextOrder,
  SCHEMA_VERSION,
} from "./types";
import { normalizeUrl } from "./url";

export { INBOX_GROUP_COLOR, INBOX_GROUP_ID, SCHEMA_VERSION } from "./types";

export { normalizeUrl } from "./url";

export interface NewBookmarkInput {
  url: string;
  title?: string;
  note?: string;
  /** 缺省进收集箱 */
  groupId?: GroupId;
  /** 预抓取的网页图标 data URL(schema v2,缺省由添加后补令牌回填) */
  icon?: string;
}

export interface BookmarkPatch {
  url?: string;
  title?: string;
  note?: string;
  groupId?: GroupId;
  /** 网页图标回填(board-refresh/05);undefined = 不动 */
  icon?: string;
}

export interface NewGroupInput {
  name: string;
  color: string;
}

export interface BookmarkStore {
  /** 当前状态快照(创建时已从适配器加载) */
  getState(): BookmarkState;
  /** 按原始 URL 查收藏:内部走 normalizeUrl,不可收藏 URL 一律 null。图标状态判定用。 */
  findBookmarkByUrl(url: string): Bookmark | null;
  addBookmark(input: NewBookmarkInput): Promise<Result<Bookmark>>;
  updateBookmark(
    id: BookmarkId,
    patch: BookmarkPatch
  ): Promise<Result<Bookmark>>;
  removeBookmark(id: BookmarkId): Promise<Result<BookmarkId>>;
  createGroup(input: NewGroupInput): Promise<Result<Group>>;
  renameGroup(id: GroupId, name: string): Promise<Result<Group>>;
  recolorGroup(id: GroupId, color: string): Promise<Result<Group>>;
  /** 组间排序:传入全部分组 id 的新顺序,重排为 0..n-1。 */
  reorderGroups(groupIds: GroupId[]): Promise<Result<Group[]>>;
  /** 删除分组:组内收藏全部回收进收集箱(绝不连带删除)。 */
  deleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  /**
   * 移动收藏统一入口:目标组缺省为原组,下标缺省追加到目标组末尾。
   * 两参调用(仅给组)= 右键换组语义:跨组追加末尾、同组无操作不落盘;
   * 给下标则跨组定点插入或组内排序,全组重排为 0..n-1。
   */
  moveBookmark(
    id: BookmarkId,
    groupId?: GroupId,
    index?: number
  ): Promise<Result<Bookmark>>;
}

function initialState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [createInboxGroup(0)],
    bookmarks: [],
  };
}

/** 收集箱永远存在:加载到缺失收集箱的状态(损坏数据)时补回最前。 */
function ensureInbox(state: BookmarkState): BookmarkState {
  if (state.groups.some((g) => g.id === INBOX_GROUP_ID)) return state;
  return {
    ...state,
    groups: [createInboxGroup(-1), ...state.groups],
  };
}

/**
 * 两状态是否语义相等(逐字段、含数组顺序)。
 * boot 回声抑制用:自身写入引发的 onChanged 回声携带与当前一致的状态,相等即可
 * 跳过重建;外部写入携带不同状态,不等即重建。数组顺序参与相等(顺序即语义)。
 */
export function statesEqual(a: BookmarkState, b: BookmarkState): boolean {
  if (a === b) return true;
  if (
    a.schemaVersion !== b.schemaVersion ||
    a.groups.length !== b.groups.length ||
    a.bookmarks.length !== b.bookmarks.length
  ) {
    return false;
  }
  for (let i = 0; i < a.groups.length; i++) {
    const x = a.groups[i];
    const y = b.groups[i];
    if (
      x.id !== y.id ||
      x.name !== y.name ||
      x.color !== y.color ||
      x.order !== y.order
    ) {
      return false;
    }
  }
  for (let i = 0; i < a.bookmarks.length; i++) {
    const x = a.bookmarks[i];
    const y = b.bookmarks[i];
    if (
      x.id !== y.id ||
      x.url !== y.url ||
      x.title !== y.title ||
      x.note !== y.note ||
      x.groupId !== y.groupId ||
      x.order !== y.order ||
      x.icon !== y.icon
    ) {
      return false;
    }
  }
  return true;
}

/**
 * 是否仍是全新安装的初始态(仅收集箱、零收藏)。导出供预览种子等外部使用;
 * 懒挂载折叠缺省(工单 10b)已随 ui-refresh/04 移除折叠而下线。
 */
export function isFreshInstallState(state: BookmarkState): boolean {
  return (
    state.groups.length === 1 &&
    state.groups[0].id === INBOX_GROUP_ID &&
    state.bookmarks.length === 0
  );
}

export async function createBookmarkStore(
  adapter: StorageAdapter
): Promise<BookmarkStore> {
  let loaded = await adapter.load();
  if (loaded === null) {
    loaded = initialState();
    await adapter.save(loaded);
  } else {
    const repaired = ensureInbox(loaded);
    // 旧版本状态(v1 无 icon)读入时在内存升级到当前版本,下次写入自然落盘
    if (repaired !== loaded || repaired.schemaVersion !== SCHEMA_VERSION) {
      loaded = { ...repaired, schemaVersion: SCHEMA_VERSION };
      await adapter.save(loaded);
    }
  }
  let state = loaded;

  function groupExists(id: GroupId): boolean {
    return state.groups.some((g) => g.id === id);
  }

  function nextBookmarkOrder(groupId: GroupId): number {
    return nextOrder(
      state.bookmarks.filter((b) => b.groupId === groupId).map((b) => b.order)
    );
  }

  function nextGroupOrder(): number {
    return nextOrder(state.groups.map((g) => g.order));
  }

  return {
    getState() {
      return state;
    },

    findBookmarkByUrl(url: string): Bookmark | null {
      const normalized = normalizeUrl(url);
      if (normalized === null) return null;
      return state.bookmarks.find((b) => b.url === normalized) ?? null;
    },

    async addBookmark(input: NewBookmarkInput): Promise<Result<Bookmark>> {
      const url = normalizeUrl(input.url);
      if (url === null) return { ok: false, error: "invalid-url" };
      const groupId = input.groupId ?? INBOX_GROUP_ID;
      if (!groupExists(groupId)) return { ok: false, error: "group-not-found" };
      if (state.bookmarks.some((b) => b.url === url))
        return { ok: false, error: "duplicate-url" };
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        url,
        title: (input.title ?? "").trim() || new URL(url).hostname,
        note: (input.note ?? "").trim(),
        groupId,
        order: nextBookmarkOrder(groupId),
        ...(input.icon ? { icon: input.icon } : {}),
      };
      state = { ...state, bookmarks: [...state.bookmarks, bookmark] };
      await adapter.save(state);
      return { ok: true, value: bookmark };
    },

    async updateBookmark(
      id: BookmarkId,
      patch: BookmarkPatch
    ): Promise<Result<Bookmark>> {
      const existing = state.bookmarks.find((b) => b.id === id);
      if (!existing) return { ok: false, error: "bookmark-not-found" };
      let url = existing.url;
      if (patch.url !== undefined) {
        const next = normalizeUrl(patch.url);
        if (next === null) return { ok: false, error: "invalid-url" };
        if (state.bookmarks.some((b) => b.url === next && b.id !== id)) {
          return { ok: false, error: "duplicate-url" };
        }
        url = next;
      }
      let groupId = existing.groupId;
      if (patch.groupId !== undefined) {
        if (!groupExists(patch.groupId))
          return { ok: false, error: "group-not-found" };
        groupId = patch.groupId;
      }
      const updated: Bookmark = {
        ...existing,
        url,
        // 与添加同规则:清空标题回退主机名,不存空串
        title:
          patch.title === undefined
            ? existing.title
            : patch.title.trim() || new URL(url).hostname,
        note: patch.note !== undefined ? patch.note.trim() : existing.note,
        groupId,
      };
      // 图标回填:仅在拿到可用 data URL 时覆盖;空串/undefined 不动原有值
      if (patch.icon) updated.icon = patch.icon;
      state = {
        ...state,
        bookmarks: state.bookmarks.map((b) => (b.id === id ? updated : b)),
      };
      await adapter.save(state);
      return { ok: true, value: updated };
    },

    async removeBookmark(id: BookmarkId): Promise<Result<BookmarkId>> {
      if (!state.bookmarks.some((b) => b.id === id))
        return { ok: false, error: "bookmark-not-found" };
      state = {
        ...state,
        bookmarks: state.bookmarks.filter((b) => b.id !== id),
      };
      await adapter.save(state);
      return { ok: true, value: id };
    },

    async createGroup({ name, color }: NewGroupInput): Promise<Result<Group>> {
      const trimmedName = name.trim();
      if (!trimmedName) return { ok: false, error: "empty-group-name" };
      const trimmedColor = color.trim();
      if (!trimmedColor) return { ok: false, error: "empty-group-color" };
      const group: Group = {
        id: crypto.randomUUID(),
        name: trimmedName,
        color: trimmedColor,
        order: nextGroupOrder(),
      };
      state = { ...state, groups: [...state.groups, group] };
      await adapter.save(state);
      return { ok: true, value: group };
    },

    async renameGroup(id: GroupId, name: string): Promise<Result<Group>> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: "inbox-immutable" };
      const group = state.groups.find((g) => g.id === id);
      if (!group) return { ok: false, error: "group-not-found" };
      const trimmedName = name.trim();
      if (!trimmedName) return { ok: false, error: "empty-group-name" };
      const renamed: Group = { ...group, name: trimmedName };
      state = {
        ...state,
        groups: state.groups.map((g) => (g.id === id ? renamed : g)),
      };
      await adapter.save(state);
      return { ok: true, value: renamed };
    },

    async recolorGroup(id: GroupId, color: string): Promise<Result<Group>> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: "inbox-immutable" };
      const group = state.groups.find((g) => g.id === id);
      if (!group) return { ok: false, error: "group-not-found" };
      const trimmedColor = color.trim();
      if (!trimmedColor) return { ok: false, error: "empty-group-color" };
      const recolored: Group = { ...group, color: trimmedColor };
      state = {
        ...state,
        groups: state.groups.map((g) => (g.id === id ? recolored : g)),
      };
      await adapter.save(state);
      return { ok: true, value: recolored };
    },

    async reorderGroups(groupIds: GroupId[]): Promise<Result<Group[]>> {
      if (groupIds.some((id) => !groupExists(id))) {
        return { ok: false, error: "group-not-found" };
      }
      if (
        groupIds.length !== state.groups.length ||
        new Set(groupIds).size !== groupIds.length
      ) {
        return { ok: false, error: "invalid-group-order" };
      }
      const byId = new Map(state.groups.map((g) => [g.id, g]));
      const groups = groupIds.map((id, index) => ({
        ...byId.get(id)!,
        order: index,
      }));
      state = { ...state, groups };
      await adapter.save(state);
      return { ok: true, value: groups };
    },

    async deleteGroup(id: GroupId): Promise<DeleteGroupResult> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: "inbox-immutable" };
      if (!groupExists(id)) return { ok: false, error: "group-not-found" };
      // 按组内顺序回收,接在收集箱已有收藏之后
      const recycled = state.bookmarks
        .filter((b) => b.groupId === id)
        .sort((a, b) => a.order - b.order);
      const baseOrder = nextBookmarkOrder(INBOX_GROUP_ID);
      const orderById = new Map(
        recycled.map((b, i) => [b.id, baseOrder + i] as const)
      );
      const bookmarks = state.bookmarks.map((b) =>
        orderById.has(b.id)
          ? { ...b, groupId: INBOX_GROUP_ID, order: orderById.get(b.id)! }
          : b
      );
      const groups = state.groups.filter((g) => g.id !== id);
      state = { ...state, groups, bookmarks };
      await adapter.save(state);
      return {
        ok: true,
        value: { groupId: id, recycledIds: recycled.map((b) => b.id) },
      };
    },

    async moveBookmark(
      id: BookmarkId,
      groupId?: GroupId,
      index?: number
    ): Promise<Result<Bookmark>> {
      const existing = state.bookmarks.find((b) => b.id === id);
      if (!existing) return { ok: false, error: "bookmark-not-found" };
      const targetGroupId = groupId ?? existing.groupId;
      if (!groupExists(targetGroupId))
        return { ok: false, error: "group-not-found" };
      // 两参同组调用 = 无操作成功(右键换组依赖):状态与持久层均不变
      if (targetGroupId === existing.groupId && index === undefined) {
        return { ok: true, value: existing };
      }
      // 目标组去掉被移动项后按下标插入,全组重排为 0..n-1(下标缺省/越界即末尾)
      const others = state.bookmarks
        .filter((b) => b.groupId === targetGroupId && b.id !== id)
        .sort((a, b) => a.order - b.order);
      const insertAt = Math.max(
        0,
        Math.min(index ?? others.length, others.length)
      );
      const targetList = [
        ...others.slice(0, insertAt),
        { ...existing, groupId: targetGroupId },
        ...others.slice(insertAt),
      ].map((b, i) => ({ ...b, order: i }));
      const byId = new Map(targetList.map((b) => [b.id, b] as const));
      // 移出后原组剩余收藏 order 同步收紧为 0..n-1,避免留下空洞
      if (targetGroupId !== existing.groupId) {
        for (const [i, b] of state.bookmarks
          .filter((bm) => bm.groupId === existing.groupId && bm.id !== id)
          .sort((x, y) => x.order - y.order)
          .entries()) {
          byId.set(b.id, { ...b, order: i });
        }
      }
      const bookmarks = state.bookmarks.map((b) => byId.get(b.id) ?? b);
      state = { ...state, bookmarks };
      await adapter.save(state);
      return { ok: true, value: byId.get(id)! };
    },
  };
}
