import type { BookmarkState, StorageAdapter } from './types'
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID, SCHEMA_VERSION } from './types'

export { INBOX_GROUP_COLOR, INBOX_GROUP_ID, SCHEMA_VERSION } from './types'

export interface BookmarkStore {
  /** 当前状态快照(创建时已从适配器加载) */
  getState(): BookmarkState
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

  return {
    getState() {
      return state
    },
  }
}
