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

describe('添加收藏', () => {
  it('缺省进收集箱,URL 规范化保存,标题留空回退主机名', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    const result = await store.addBookmark({ url: 'HTTPS://Example.com/#top', title: '  ', note: ' 示例 ' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      url: 'https://example.com',
      title: 'example.com',
      note: '示例',
      groupId: INBOX_GROUP_ID,
      order: 0,
    })
    expect(store.getState().bookmarks).toHaveLength(1)
  })

  it('无效 URL 被拒,不产生数据', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    const result = await store.addBookmark({ url: '不是网址', title: 'x' })

    expect(result).toEqual({ ok: false, error: 'invalid-url' })
    expect(store.getState().bookmarks).toEqual([])
  })

  it('重复 URL(规范化后同值)被拒', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    await store.addBookmark({ url: 'https://example.com' })

    const dup = await store.addBookmark({ url: 'HTTPS://EXAMPLE.com/#frag' })

    expect(dup).toEqual({ ok: false, error: 'duplicate-url' })
    expect(store.getState().bookmarks).toHaveLength(1)
  })

  it('指定不存在的分组被拒;指定现存分组则收藏进该组且组内 order 递增', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    const missing = await store.addBookmark({ url: 'https://example.com', groupId: 'nope' })
    expect(missing).toEqual({ ok: false, error: 'group-not-found' })

    const group = await store.createGroup({ name: '工作', color: '#e99695' })
    expect(group.ok).toBe(true)
    if (!group.ok) return

    const a = await store.addBookmark({ url: 'https://a.example.com', groupId: group.value.id })
    const b = await store.addBookmark({ url: 'https://b.example.com', groupId: group.value.id })
    expect(a.ok && a.value.order).toBe(0)
    expect(b.ok && b.value.order).toBe(1)
    expect(store.getState().bookmarks.every((bm) => bm.groupId === group.value.id)).toBe(true)
  })

  it('建组:空名被拒;新组排在收集箱之后', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    expect(await store.createGroup({ name: '  ', color: '#fff' })).toEqual({
      ok: false,
      error: 'empty-group-name',
    })
    expect(await store.createGroup({ name: '工作', color: '  ' })).toEqual({
      ok: false,
      error: 'empty-group-color',
    })

    const created = await store.createGroup({ name: ' 工作 ', color: '#e99695' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.name).toBe('工作')
    expect(store.getState().groups.map((g) => [g.id, g.order])).toEqual([
      [INBOX_GROUP_ID, 0],
      [created.value.id, 1],
    ])
  })
})
