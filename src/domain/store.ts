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
  /** 按原始 URL 查收藏:内部走 normalizeUrl,不可收藏 URL 一律 null。图标状态判定用。 */
  findBookmarkByUrl(url: string): Bookmark | null
  addBookmark(input: NewBookmarkInput): Promise<Result<Bookmark>>
  updateBookmark(id: BookmarkId, patch: BookmarkPatch): Promise<Result<Bookmark>>
  removeBookmark(id: BookmarkId): Promise<Result<BookmarkId>>
  /** 跨组移动:目标组内追加到末尾;同组视为无操作(右键换组收藏依赖) */
  moveBookmark(id: BookmarkId, groupId: GroupId): Promise<Result<Bookmark>>
  createGroup(input: NewGroupInput): Promise<Result<Group>>
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

  return {
    getState() {
      return state
    },

    findBookmarkByUrl(url: string): Bookmark | null {
      const normalized = normalizeUrl(url)
      if (normalized === null) return null
      return state.bookmarks.find((b) => b.url === normalized) ?? null
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

    async moveBookmark(id: BookmarkId, groupId: GroupId): Promise<Result<Bookmark>> {
      const existing = state.bookmarks.find((b) => b.id === id)
      if (!existing) return { ok: false, error: 'bookmark-not-found' }
      if (!groupExists(groupId)) return { ok: false, error: 'group-not-found' }
      if (existing.groupId === groupId) return { ok: true, value: existing }
      const moved: Bookmark = {
        ...existing,
        groupId,
        order: nextBookmarkOrder(groupId),
      }
      state = { ...state, bookmarks: state.bookmarks.map((b) => (b.id === id ? moved : b)) }
      await adapter.save(state)
      return { ok: true, value: moved }
    },

    async createGroup({ name, color }: NewGroupInput): Promise<Result<Group>> {
      const trimmedName = name.trim()
      if (!trimmedName) return { ok: false, error: 'empty-group-name' }
      const trimmedColor = color.trim()
      if (!trimmedColor) return { ok: false, error: 'empty-group-color' }
      const orders = state.groups.map((g) => g.order)
      const group: Group = {
        id: crypto.randomUUID(),
        name: trimmedName,
        color: trimmedColor,
        order: orders.length === 0 ? 0 : Math.max(...orders) + 1,
      }
      state = { ...state, groups: [...state.groups, group] }
      await adapter.save(state)
      return { ok: true, value: group }
    },
  }
}
