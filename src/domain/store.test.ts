import { describe, expect, it } from 'vitest'
import { INBOX_GROUP_ID, SCHEMA_VERSION, createBookmarkStore } from './store'
import { createMemoryStorage } from '../storage/memoryStorage'
import type { BookmarkState } from './types'

describe('收藏库初始化', () => {
  it('全新存储:生成含 schemaVersion 与收集箱保留组的状态', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    const state = store.getState()
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(state.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID])
    expect(state.groups[0]).toMatchObject({ name: '收集箱' })
    expect(state.bookmarks).toEqual([])
  })

  it('状态经注入的存储适配器持久化:换一个库实例仍能读到同一状态', async () => {
    const storage = createMemoryStorage()
    const first = await createBookmarkStore(storage)
    const seeded = first.getState()

    const second = await createBookmarkStore(storage)
    expect(second.getState()).toEqual(seeded)
  })

  it('读取既有状态时不破坏原始数据(schemaVersion 与分组保留)', async () => {
    const existing: BookmarkState = {
      schemaVersion: SCHEMA_VERSION,
      groups: [
        { id: INBOX_GROUP_ID, name: '收集箱', color: '#3b82f6', order: 0 },
        { id: 'g-news', name: '资讯', color: '#e99695', order: 1 },
      ],
      bookmarks: [],
    }
    const store = await createBookmarkStore(createMemoryStorage(existing))

    expect(store.getState()).toEqual(existing)
  })
})
