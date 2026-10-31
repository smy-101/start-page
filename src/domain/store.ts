import type {
  Bookmark,
  BookmarkId,
  BookmarkState,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
  StorageAdapter,
  TodoCard,
  TodoId,
  TodoItem,
} from "./types";
import {
  createInboxGroup,
  DEFAULT_TODO_TITLE,
  INBOX_GROUP_ID,
  nextOrder,
  SCHEMA_VERSION,
} from "./types";
import { normalizeUrl } from "./url";
import { migrateState } from "./migrations";
import {
  CARD_W,
  MAX_GROUP_COLUMNS,
  appendPositions,
  canvasBoundWidth,
  clampCanvasWidth,
  clampToCanvas,
  groupSpanOf,
  groupWidthOf,
  maxSpanForCanvas,
} from "./canvas";

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

/** 白板落点写回条目:分组 id + 画布坐标(px)。 */
export interface GroupPositionInput {
  id: GroupId;
  x: number;
  y: number;
}

/** 待办卡落点写回条目(todo-card):与分组同形状,钳界按定宽 CARD_W。 */
export interface TodoPositionInput {
  id: TodoId;
  x: number;
  y: number;
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
  /**
   * 白板落点批量写回(ADR-0004):拖拽单卡(一条)与「自动整理」(整批)
   * 共用同一入口。坐标经 clampToCanvas 钳回(非负、不越画布右界——固定宽按
   * 固定值,自动档按上限,实际渲染宽由组件先行钳过);任何未知 id 整批拒绝,
   * 无部分写入;坐标无变化不落盘。
   */
  setGroupPositions(
    positions: readonly GroupPositionInput[]
  ): Promise<Result<Group[]>>;
  /**
   * 画布宽写回(schema v4 起,canvas-bounds-align):右缘拖柄松手/键盘调整
   * 调用,自动档由此钉住为固定宽。钳回 [720, 2400] 后落盘;缩宽时越界分组
   * 坐标重钳到新右界;宽度与坐标均无实际变化不落盘(自动档无存储值,
   * 钉任意值都算变化)。返回生效宽度。
   */
  setCanvasWidth(width: number): Promise<Result<number>>;
  /**
   * 每行条数写回(表单路径,schema v7 语义升级,group-span-decouple):
   * 钳回 [1, min(6, 画布放得下的最大档)] 后落盘;**组宽只升不降**
   * (span' = max(档位, cells)——拖出来的长度保持住,表单只是组内排版);
   * 档位脱离推导时物化写入;变宽重钳 x;同义(含缺省装满)不落盘。
   */
  setGroupColumns(id: GroupId, columns: number): Promise<Result<Group>>;
  /**
   * 组宽档位写回(schema v7,拖柄/键盘路径):钳
   * [1, min(6, 画布放得下的最大档)] 后落盘;每行条数存在且超档时自动降
   * 到档位(缺省保持装满);变宽后按新宽重钳 x;同义不落盘。
   */
  setGroupSpan(id: GroupId, span: number): Promise<Result<Group>>;
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

  // ---- 待办卡(todo-card,ADR-0006;日常态仅勾选开放,其余编辑锁白板模式) ----

  /** 新建待办卡:缺省标题「待办」、空条目,落画布底部追加(推算含分组+待办)。 */
  createTodo(): Promise<Result<TodoCard>>;
  /** 改标题:修剪;空文本回退「待办」(inline 快改,不报错);同名不落盘。 */
  renameTodo(id: TodoId, title: string): Promise<Result<TodoCard>>;
  /** 删卡:直接删,不进收集箱、无确认。 */
  deleteTodo(id: TodoId): Promise<Result<TodoId>>;
  /** 加条目:修剪后非空;插到未完成区末(完成区整体让位到其后)。 */
  addTodoItem(todoId: TodoId, text: string): Promise<Result<TodoCard>>;
  /** 改条目文本:修剪;空拒;位置/完成态不动。 */
  editTodoItem(
    todoId: TodoId,
    itemId: TodoId,
    text: string
  ): Promise<Result<TodoCard>>;
  /**
   * 勾选/取消:翻转后归入对应区末——完成→完成区末(沉底),
   * 取消→未完成区末(回升);toggle 是唯一沉底执行者,手工排序自由。
   */
  toggleTodoItem(todoId: TodoId, itemId: TodoId): Promise<Result<TodoCard>>;
  /** 删条目:余下重排 0..n−1。 */
  removeTodoItem(todoId: TodoId, itemId: TodoId): Promise<Result<TodoCard>>;
  /** 卡内排序:给定全量条目 id 新序(自由摆放,可越完成/未完成界),重排 0..n−1。 */
  reorderTodoItems(
    todoId: TodoId,
    itemIds: readonly TodoId[]
  ): Promise<Result<TodoCard>>;
  /**
   * 待办卡落点批量写回(白板拖拽松手/自动整理):坐标经 clampToCanvas
   * 钳回(右界按定宽 CARD_W);任何未知 id 整批拒绝;无变化不落盘。
   */
  setTodoPositions(
    positions: readonly TodoPositionInput[]
  ): Promise<Result<TodoCard[]>>;
}

function initialState(): BookmarkState {
  // 画布宽缺省 = 自动档(schema v5):不写数值,渲染时撑满可用宽;
  // todos 空数组(v8):升级不预置示例卡(ADR-0006)
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [createInboxGroup(0)],
    bookmarks: [],
    todos: [],
  };
}

/** 收集箱永远存在:加载到缺失收集箱的状态(损坏数据)时补回最前,落画布底部追加位。 */
function ensureInbox(state: BookmarkState): BookmarkState {
  if (state.groups.some((g) => g.id === INBOX_GROUP_ID)) return state;
  return {
    ...state,
    groups: [
      createInboxGroup(-1, appendPositions(state.groups)[0]),
      ...state.groups,
    ],
  };
}

/**
 * 两状态是否语义相等(逐字段、含数组顺序)。
 * boot 回声抑制用:自身写入引发的 onChanged 回声携带与当前一致的状态,相等即可
 * 跳过重建;外部写入携带不同状态,不等即重建。数组顺序参与相等(顺序即语义);
 * 画布宽逐字比较(schema v5:缺省自动档 ≠ 钉住的固定宽)。
 * todos 逐字段参与(schema v8,todo-card):待办勾选/增删也要触发回声重建。
 */
export function statesEqual(a: BookmarkState, b: BookmarkState): boolean {
  if (a === b) return true;
  if (
    a.schemaVersion !== b.schemaVersion ||
    a.canvasWidth !== b.canvasWidth ||
    a.groups.length !== b.groups.length ||
    a.bookmarks.length !== b.bookmarks.length ||
    (a.todos ?? []).length !== (b.todos ?? []).length
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
      x.order !== y.order ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.columns !== y.columns ||
      x.span !== y.span
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
  // 待办卡逐字段(schema v8):卡 id/标题/顺序/坐标 + 条目 id/文本/完成态/顺序
  const todosA = a.todos ?? [];
  const todosB = b.todos ?? [];
  for (let i = 0; i < todosA.length; i++) {
    const x = todosA[i];
    const y = todosB[i];
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.items.length !== y.items.length ||
      x.order !== y.order ||
      x.x !== y.x ||
      x.y !== y.y
    ) {
      return false;
    }
    for (let j = 0; j < x.items.length; j++) {
      const p = x.items[j];
      const q = y.items[j];
      if (
        p.id !== q.id ||
        p.text !== q.text ||
        p.done !== q.done ||
        p.order !== q.order
      ) {
        return false;
      }
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
    state.bookmarks.length === 0 &&
    // 待办卡也是内容(schema v8):建过待办不算全新安装,不出导入引导
    (state.todos ?? []).length === 0
  );
}

/**
 * 待办条目重排(todo-card):按数组序重写 order 为 0..n−1
 * (数组序即展示序,未变项保持原对象引用);一切写路径的收尾其同步。
 */
function renumberTodoItems(items: readonly TodoItem[]): TodoItem[] {
  return items.map((item, i) =>
    item.order === i ? item : { ...item, order: i }
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
    // 迁移链先行(v2 及更早 → v3:分组装箱出画布坐标),损坏修复(补收集箱)在其后
    const migrated = migrateState(loaded);
    const repaired = ensureInbox(migrated);
    if (repaired !== loaded) {
      loaded = repaired;
      await adapter.save(loaded);
    }
  }
  let state = loaded;

  function groupExists(id: GroupId): boolean {
    return state.groups.some((g) => g.id === id);
  }

  /**
   * 组宽字段写回共用(group-span-decouple):物化档位/每行条数,按新宽
   * 重钳 x 回画布内(y 只压非负),落盘并返回新组。同义判定由两条入口
   * 各自完成(setGroupColumns 只升不降 / setGroupSpan 自动降条数)。
   */
  async function writeGroupSizing(
    group: Group,
    span: number,
    columns: number | undefined
  ): Promise<Result<Group>> {
    const pos = clampToCanvas(
      { x: group.x, y: group.y },
      canvasBoundWidth(state),
      groupWidthOf(span)
    );
    const resized: Group = { ...group, span, columns, x: pos.x, y: pos.y };
    state = {
      ...state,
      groups: state.groups.map((g) => (g.id === group.id ? resized : g)),
    };
    await adapter.save(state);
    return { ok: true, value: resized };
  }

  function nextBookmarkOrder(groupId: GroupId): number {
    return nextOrder(
      state.bookmarks.filter((b) => b.groupId === groupId).map((b) => b.order)
    );
  }

  /** 待办卡整卡替换后落盘并返回新卡(todo-card 写路径共用形状)。 */
  async function writeTodo(updated: TodoCard): Promise<Result<TodoCard>> {
    state = {
      ...state,
      todos: (state.todos ?? []).map((t) =>
        t.id === updated.id ? updated : t
      ),
    };
    await adapter.save(state);
    return { ok: true, value: updated };
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
        // 默认落位:画布底部左侧追加(第一个空位的简单实现,同原型)
        ...appendPositions(state.groups)[0],
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

    async setGroupPositions(
      positions: readonly GroupPositionInput[]
    ): Promise<Result<Group[]>> {
      if (positions.length === 0) return { ok: true, value: state.groups };
      if (positions.some((p) => !groupExists(p.id))) {
        return { ok: false, error: "group-not-found" };
      }
      const width = canvasBoundWidth(state);
      const widthOf = new Map(
        state.groups.map((g) => [g.id, groupWidthOf(groupSpanOf(g))] as const)
      );
      const byId = new Map(
        positions.map((p) => {
          // 各组按各自宽钳右界(group-width-tint);未知 id 已整批拒绝
          const clamped = clampToCanvas(
            { x: p.x, y: p.y },
            width,
            widthOf.get(p.id)
          );
          return [p.id, clamped] as const;
        })
      );
      let changed = false;
      const groups = state.groups.map((g) => {
        const next = byId.get(g.id);
        if (!next || (next.x === g.x && next.y === g.y)) return g;
        changed = true;
        return { ...g, x: next.x, y: next.y };
      });
      if (changed) {
        state = { ...state, groups };
        await adapter.save(state);
      }
      return { ok: true, value: groups };
    },

    async setCanvasWidth(width: number): Promise<Result<number>> {
      const clamped = clampCanvasWidth(width);
      // 逐字比较:自动档(缺省)钉任意值都算变化(schema v5)
      const widthChanged = clamped !== state.canvasWidth;
      // 缩宽时超档组降档(maxSpanForCanvas)、每行条数连带降到档位,
      // 坐标按各自宽重钳到新右界(宽化不变坐标与档位);逐组判断,
      // 未动者原对象保留
      let moved = false;
      const groups = state.groups.map((g) => {
        const maxSpan = maxSpanForCanvas(clamped);
        const span = Math.min(groupSpanOf(g), maxSpan);
        const columns =
          g.columns === undefined ? undefined : Math.min(g.columns, span);
        const pos = clampToCanvas(
          { x: g.x, y: g.y },
          clamped,
          groupWidthOf(span)
        );
        // 档位与每行条数生效值均未动且坐标未动:原对象保留(不写入显式 undefined)
        const widthSame =
          span === groupSpanOf(g) &&
          (columns ?? span) === (g.columns ?? groupSpanOf(g));
        if (widthSame && pos.x === g.x && pos.y === g.y) return g;
        moved = true;
        if (widthSame) return { ...g, x: pos.x, y: pos.y };
        return { ...g, span, columns, x: pos.x, y: pos.y };
      });
      if (!widthChanged && !moved) return { ok: true, value: clamped };
      state = { ...state, canvasWidth: clamped, groups };
      await adapter.save(state);
      return { ok: true, value: clamped };
    },

    async setGroupColumns(
      id: GroupId,
      columns: number
    ): Promise<Result<Group>> {
      const group = state.groups.find((g) => g.id === id);
      if (!group) return { ok: false, error: "group-not-found" };
      // 钳上界随画布宽(自动档按上限);非有限值归 1,取整一律 floor
      const maxSpan = maxSpanForCanvas(canvasBoundWidth(state));
      const requested = Number.isFinite(columns) ? Math.floor(columns) : 1;
      const cells = Math.max(
        1,
        Math.min(requested, MAX_GROUP_COLUMNS, maxSpan)
      );
      // 表单永不缩宽(group-span-decouple):档位只升不降,拖出来的长度保持住
      const spanEff = groupSpanOf(group);
      const span = Math.max(spanEff, cells);
      // 与当前生效值同义(含缺省装满)不落盘;写则统一物化档位
      // (span = cells 时存否等价,物化保住后续降条数不缩宽)
      const cellsEff = group.columns ?? spanEff;
      if (cells === cellsEff && span === spanEff) {
        return { ok: true, value: group };
      }
      return writeGroupSizing(group, span, cells);
    },

    async setGroupSpan(id: GroupId, span: number): Promise<Result<Group>> {
      const group = state.groups.find((g) => g.id === id);
      if (!group) return { ok: false, error: "group-not-found" };
      // 钳上界随画布宽(自动档按上限);非有限值归 1,取整一律 floor
      const maxSpan = maxSpanForCanvas(canvasBoundWidth(state));
      const requested = Number.isFinite(span) ? Math.floor(span) : 1;
      const nextSpan = Math.max(
        1,
        Math.min(requested, MAX_GROUP_COLUMNS, maxSpan)
      );
      // 每行条数自动降(拖窄装不下时,用户定案):存在且超档 → 降到档位;
      // 缺省保持装满
      const nextColumns =
        group.columns === undefined
          ? undefined
          : Math.min(group.columns, nextSpan);
      // 与当前生效值同义(含缺省装满:undefined 侧归一到各自档位)不落盘
      if (
        nextSpan === groupSpanOf(group) &&
        (nextColumns ?? nextSpan) === (group.columns ?? groupSpanOf(group))
      ) {
        return { ok: true, value: group };
      }
      return writeGroupSizing(group, nextSpan, nextColumns);
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

    // ---- 待办卡(todo-card,ADR-0006)----

    async createTodo(): Promise<Result<TodoCard>> {
      const todos = state.todos ?? [];
      const card: TodoCard = {
        id: crypto.randomUUID(),
        title: DEFAULT_TODO_TITLE,
        items: [],
        order: nextOrder(todos.map((t) => t.order)),
        // 默认落位:画布底部左侧追加(推算含分组与既有待办,同新建分组口径)
        ...appendPositions([...state.groups, ...todos])[0],
      };
      state = { ...state, todos: [...todos, card] };
      await adapter.save(state);
      return { ok: true, value: card };
    },

    async renameTodo(id: TodoId, title: string): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === id);
      if (!card) return { ok: false, error: "todo-not-found" };
      // inline 快改语义:空文本回退缺省标题,不报错(与分组表单报错分道)
      const next = title.trim() || DEFAULT_TODO_TITLE;
      if (next === card.title) return { ok: true, value: card };
      return writeTodo({ ...card, title: next });
    },

    async deleteTodo(id: TodoId): Promise<Result<TodoId>> {
      const todos = state.todos ?? [];
      if (!todos.some((t) => t.id === id))
        return { ok: false, error: "todo-not-found" };
      // 直接删,不进收集箱(收集箱语义专属收藏,ADR-0006)
      state = { ...state, todos: todos.filter((t) => t.id !== id) };
      await adapter.save(state);
      return { ok: true, value: id };
    },

    async addTodoItem(todoId: TodoId, text: string): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === todoId);
      if (!card) return { ok: false, error: "todo-not-found" };
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "empty-todo-text" };
      // 新条目恒未完成:插到未完成区末(完成区整体让位到其后)
      const undone = card.items.filter((i) => !i.done);
      const done = card.items.filter((i) => i.done);
      const item: TodoItem = {
        id: crypto.randomUUID(),
        text: trimmed,
        done: false,
        order: 0,
      };
      return writeTodo({
        ...card,
        items: renumberTodoItems([...undone, item, ...done]),
      });
    },

    async editTodoItem(
      todoId: TodoId,
      itemId: TodoId,
      text: string
    ): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === todoId);
      if (!card) return { ok: false, error: "todo-not-found" };
      if (!card.items.some((i) => i.id === itemId))
        return { ok: false, error: "todo-item-not-found" };
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "empty-todo-text" };
      return writeTodo({
        ...card,
        items: card.items.map((i) =>
          i.id === itemId ? { ...i, text: trimmed } : i
        ),
      });
    },

    async toggleTodoItem(
      todoId: TodoId,
      itemId: TodoId
    ): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === todoId);
      if (!card) return { ok: false, error: "todo-not-found" };
      const target = card.items.find((i) => i.id === itemId);
      if (!target) return { ok: false, error: "todo-item-not-found" };
      // 沉底/回升:翻转后归入对应区末——完成→完成区末(整体沉底),
      // 取消→未完成区末(回升到完成区之前);其余相对序不动
      const others = card.items.filter((i) => i.id !== itemId);
      const undone = others.filter((i) => !i.done);
      const done = others.filter((i) => i.done);
      const flipped: TodoItem = { ...target, done: !target.done };
      return writeTodo({
        ...card,
        items: renumberTodoItems(
          flipped.done
            ? [...undone, ...done, flipped]
            : [...undone, flipped, ...done]
        ),
      });
    },

    async removeTodoItem(
      todoId: TodoId,
      itemId: TodoId
    ): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === todoId);
      if (!card) return { ok: false, error: "todo-not-found" };
      if (!card.items.some((i) => i.id === itemId))
        return { ok: false, error: "todo-item-not-found" };
      return writeTodo({
        ...card,
        items: renumberTodoItems(card.items.filter((i) => i.id !== itemId)),
      });
    },

    async reorderTodoItems(
      todoId: TodoId,
      itemIds: readonly TodoId[]
    ): Promise<Result<TodoCard>> {
      const card = state.todos?.find((t) => t.id === todoId);
      if (!card) return { ok: false, error: "todo-not-found" };
      if (itemIds.some((id) => !card.items.some((i) => i.id === id)))
        return { ok: false, error: "todo-item-not-found" };
      if (
        itemIds.length !== card.items.length ||
        new Set(itemIds).size !== itemIds.length
      )
        return { ok: false, error: "invalid-todo-order" };
      // 自由摆放:完成/未完成可交错(下一次 toggle 才重新沉底)
      const byId = new Map(card.items.map((i) => [i.id, i] as const));
      return writeTodo({
        ...card,
        items: renumberTodoItems(itemIds.map((id) => byId.get(id)!)),
      });
    },

    async setTodoPositions(
      positions: readonly TodoPositionInput[]
    ): Promise<Result<TodoCard[]>> {
      const todos = state.todos ?? [];
      if (positions.length === 0) return { ok: true, value: todos };
      if (positions.some((p) => !todos.some((t) => t.id === p.id)))
        return { ok: false, error: "todo-not-found" };
      // 定宽 CARD_W 钳右界(自动档按上限,实际渲染宽由组件先行钳过)
      const width = canvasBoundWidth(state);
      const byId = new Map(
        positions.map((p) => {
          const clamped = clampToCanvas({ x: p.x, y: p.y }, width, CARD_W);
          return [p.id, clamped] as const;
        })
      );
      let changed = false;
      const next = todos.map((t) => {
        const pos = byId.get(t.id);
        if (pos && (pos.x !== t.x || pos.y !== t.y)) {
          changed = true;
          return { ...t, ...pos };
        }
        return t;
      });
      if (!changed) return { ok: true, value: todos };
      state = { ...state, todos: next };
      await adapter.save(state);
      return { ok: true, value: next };
    },
  };
}
