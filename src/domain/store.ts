import type {
  Bookmark,
  BookmarkId,
  BookmarkState,
  Group,
  GroupId,
  Result,
  StorageAdapter,
} from './types'
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID, SCHEMA_VERSION } from './types'
import { normalizeUrl } from './url'

export { INBOX_GROUP_COLOR, INBOX_GROUP_ID, SCHEMA_VERSION } from './types'

export { normalizeUrl } from './url'

export interface NewBookmarkInput {
  url: string
  title?: string
  note?: string
  /** 缺省进收集箱 */
  groupId?: GroupId
}

export interface BookmarkPatch {
  url?: string
  title?: string
  note?: string
  groupId?: GroupId
}

export interface NewGroupInput {
  name: string
  color: string
}

export interface BookmarkStore {
  /** 当前状态快照(创建时已从适配器加载) */
  getState(): BookmarkState
  addBookmark(input: NewBookmarkInput): Promise<Result<Bookmark>>
  updateBookmark(id: BookmarkId, patch: BookmarkPatch): Promise<Result<Bookmark>>
  removeBookmark(id: BookmarkId): Promise<Result<BookmarkId>>
  createGroup(input: NewGroupInput): Promise<Result<Group>>
  renameGroup(id: GroupId, name: string): Promise<Result<Group>>
  recolorGroup(id: GroupId, color: string): Promise<Result<Group>>
  /** 组间排序:传入全部分组 id 的新顺序,重排为 0..n-1。 */
  reorderGroups(groupIds: GroupId[]): Promise<Result<Group[]>>
  /** 删除分组:组内收藏全部回收进收集箱(绝不连带删除)。 */
  deleteGroup(id: GroupId): Promise<Result<{ groupId: GroupId; recycledIds: BookmarkId[] }>>
}

function initialState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [{ id: INBOX_GROUP_ID, name: '收集箱', color: INBOX_GROUP_COLOR, order: 0 }],
    bookmarks: [],
  }
}

/** 收集箱永远存在:加载到缺失收集箱的状态(损坏数据)时补回最前。 */
function ensureInbox(state: BookmarkState): BookmarkState {
  if (state.groups.some((g) => g.id === INBOX_GROUP_ID)) return state
  return {
    ...state,
    groups: [
      { id: INBOX_GROUP_ID, name: '收集箱', color: INBOX_GROUP_COLOR, order: -1 },
      ...state.groups,
    ],
  }
}

export async function createBookmarkStore(adapter: StorageAdapter): Promise<BookmarkStore> {
  let loaded = await adapter.load()
  if (loaded === null) {
    loaded = initialState()
    await adapter.save(loaded)
  } else {
    const repaired = ensureInbox(loaded)
    if (repaired !== loaded) {
      loaded = repaired
      await adapter.save(loaded)
    }
  }
  let state = loaded

  function groupExists(id: GroupId): boolean {
    return state.groups.some((g) => g.id === id)
  }

  function nextBookmarkOrder(groupId: GroupId): number {
    const orders = state.bookmarks.filter((b) => b.groupId === groupId).map((b) => b.order)
    return orders.length === 0 ? 0 : Math.max(...orders) + 1
  }

  function nextGroupOrder(): number {
    const orders = state.groups.map((g) => g.order)
    return orders.length === 0 ? 0 : Math.max(...orders) + 1
  }

  return {
    getState() {
      return state
    },

    async addBookmark(input: NewBookmarkInput): Promise<Result<Bookmark>> {
      const url = normalizeUrl(input.url)
      if (url === null) return { ok: false, error: 'invalid-url' }
      const groupId = input.groupId ?? INBOX_GROUP_ID
      if (!groupExists(groupId)) return { ok: false, error: 'group-not-found' }
      if (state.bookmarks.some((b) => b.url === url)) return { ok: false, error: 'duplicate-url' }
      const bookmark: Bookmark = {
        id: crypto.randomUUID(),
        url,
        title: (input.title ?? '').trim() || new URL(url).hostname,
        note: (input.note ?? '').trim(),
        groupId,
        order: nextBookmarkOrder(groupId),
      }
      state = { ...state, bookmarks: [...state.bookmarks, bookmark] }
      await adapter.save(state)
      return { ok: true, value: bookmark }
    },

    async updateBookmark(id: BookmarkId, patch: BookmarkPatch): Promise<Result<Bookmark>> {
      const existing = state.bookmarks.find((b) => b.id === id)
      if (!existing) return { ok: false, error: 'bookmark-not-found' }
      let url = existing.url
      if (patch.url !== undefined) {
        const next = normalizeUrl(patch.url)
        if (next === null) return { ok: false, error: 'invalid-url' }
        if (state.bookmarks.some((b) => b.url === next && b.id !== id)) {
          return { ok: false, error: 'duplicate-url' }
        }
        url = next
      }
      let groupId = existing.groupId
      if (patch.groupId !== undefined) {
        if (!groupExists(patch.groupId)) return { ok: false, error: 'group-not-found' }
        groupId = patch.groupId
      }
      const updated: Bookmark = {
        ...existing,
        url,
        // 与添加同规则:清空标题回退主机名,不存空串
        title: patch.title === undefined ? existing.title : patch.title.trim() || new URL(url).hostname,
        note: patch.note !== undefined ? patch.note.trim() : existing.note,
        groupId,
      }
      state = { ...state, bookmarks: state.bookmarks.map((b) => (b.id === id ? updated : b)) }
      await adapter.save(state)
      return { ok: true, value: updated }
    },

    async removeBookmark(id: BookmarkId): Promise<Result<BookmarkId>> {
      if (!state.bookmarks.some((b) => b.id === id)) return { ok: false, error: 'bookmark-not-found' }
      state = { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== id) }
      await adapter.save(state)
      return { ok: true, value: id }
    },

    async createGroup({ name, color }: NewGroupInput): Promise<Result<Group>> {
      const trimmedName = name.trim()
      if (!trimmedName) return { ok: false, error: 'empty-group-name' }
      const trimmedColor = color.trim()
      if (!trimmedColor) return { ok: false, error: 'empty-group-color' }
      const group: Group = {
        id: crypto.randomUUID(),
        name: trimmedName,
        color: trimmedColor,
        order: nextGroupOrder(),
      }
      state = { ...state, groups: [...state.groups, group] }
      await adapter.save(state)
      return { ok: true, value: group }
    },

    async renameGroup(id: GroupId, name: string): Promise<Result<Group>> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: 'inbox-immutable' }
      const group = state.groups.find((g) => g.id === id)
      if (!group) return { ok: false, error: 'group-not-found' }
      const trimmedName = name.trim()
      if (!trimmedName) return { ok: false, error: 'empty-group-name' }
      const renamed: Group = { ...group, name: trimmedName }
      state = {
        ...state,
        groups: state.groups.map((g) => (g.id === id ? renamed : g)),
      }
      await adapter.save(state)
      return { ok: true, value: renamed }
    },

    async recolorGroup(id: GroupId, color: string): Promise<Result<Group>> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: 'inbox-immutable' }
      const group = state.groups.find((g) => g.id === id)
      if (!group) return { ok: false, error: 'group-not-found' }
      const trimmedColor = color.trim()
      if (!trimmedColor) return { ok: false, error: 'empty-group-color' }
      const recolored: Group = { ...group, color: trimmedColor }
      state = {
        ...state,
        groups: state.groups.map((g) => (g.id === id ? recolored : g)),
      }
      await adapter.save(state)
      return { ok: true, value: recolored }
    },

    async reorderGroups(groupIds: GroupId[]): Promise<Result<Group[]>> {
      if (groupIds.some((id) => !groupExists(id))) {
        return { ok: false, error: 'group-not-found' }
      }
      if (
        groupIds.length !== state.groups.length ||
        new Set(groupIds).size !== groupIds.length
      ) {
        return { ok: false, error: 'invalid-group-order' }
      }
      const byId = new Map(state.groups.map((g) => [g.id, g]))
      const groups = groupIds.map((id, index) => ({ ...byId.get(id)!, order: index }))
      state = { ...state, groups }
      await adapter.save(state)
      return { ok: true, value: groups }
    },

    async deleteGroup(id: GroupId): Promise<Result<{ groupId: GroupId; recycledIds: BookmarkId[] }>> {
      if (id === INBOX_GROUP_ID) return { ok: false, error: 'inbox-immutable' }
      if (!groupExists(id)) return { ok: false, error: 'group-not-found' }
      // 按组内顺序回收,接在收集箱已有收藏之后
      const recycled = state.bookmarks
        .filter((b) => b.groupId === id)
        .sort((a, b) => a.order - b.order)
      const baseOrder = nextBookmarkOrder(INBOX_GROUP_ID)
      const orderById = new Map(recycled.map((b, i) => [b.id, baseOrder + i] as const))
      const bookmarks = state.bookmarks.map((b) =>
        orderById.has(b.id)
          ? { ...b, groupId: INBOX_GROUP_ID, order: orderById.get(b.id)! }
          : b,
      )
      const groups = state.groups.filter((g) => g.id !== id)
      state = { ...state, groups, bookmarks }
      await adapter.save(state)
      return { ok: true, value: { groupId: id, recycledIds: recycled.map((b) => b.id) } }
    },
  }
}
