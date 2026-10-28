import { describe, expect, it } from 'vitest'
import { INBOX_GROUP_ID, SCHEMA_VERSION, createBookmarkStore } from './store'
import { createMemoryStorage } from '../storage/memoryStorage'
import type { BookmarkState, StorageAdapter } from './types'

/** 不变量(锁定):每个收藏必属且仅属一个现存分组;收集箱永远存在。 */
function expectInvariants(state: BookmarkState) {
  const groupIds = new Set(state.groups.map((g) => g.id))
  expect(groupIds.has(INBOX_GROUP_ID), '收集箱永远存在').toBe(true)
  const seen = new Set<string>()
  for (const bookmark of state.bookmarks) {
    expect(groupIds.has(bookmark.groupId), `收藏 ${bookmark.id} 必属一个现存分组`).toBe(true)
    expect(seen.has(bookmark.id), `收藏 id 唯一:${bookmark.id}`).toBe(false)
    seen.add(bookmark.id)
  }
}

describe('不变量(锁定)', () => {
  it('增删改与建组序列后,每个收藏必属且仅属一个现存分组,收集箱永远存在', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    const work = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!work.ok) throw new Error('fixture setup failed')

    const a = await store.addBookmark({ url: 'https://a.example.com', title: 'A' })
    const b = await store.addBookmark({ url: 'https://b.example.com', groupId: work.value.id })
    const c = await store.addBookmark({ url: 'https://c.example.com', groupId: work.value.id })
    if (!a.ok || !b.ok || !c.ok) throw new Error('fixture setup failed')

    expectInvariants(store.getState())

    // 跨组移动 + 删除同组另一条
    await store.updateBookmark(a.value.id, { groupId: work.value.id })
    expectInvariants(store.getState())
    await store.removeBookmark(b.value.id)
    expectInvariants(store.getState())

    // 编辑 URL 与备注
    await store.updateBookmark(c.value.id, { url: 'https://c2.example.com', note: 'n' })
    expectInvariants(store.getState())

    // 删除到空再新增
    await store.removeBookmark(c.value.id)
    await store.addBookmark({ url: 'https://d.example.com' })
    expectInvariants(store.getState())

    const final = store.getState()
    expect(final.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, work.value.id])
    expect(final.bookmarks).toHaveLength(2)
  })

  it('存储里丢失收集箱的损坏状态:建库时自动补回收集箱并落盘', async () => {
    const corrupted: BookmarkState = {
      schemaVersion: SCHEMA_VERSION,
      groups: [{ id: 'g-x', name: '杂项', color: '#e99695', order: 0 }],
      bookmarks: [],
    }
    const storage: StorageAdapter = createMemoryStorage(corrupted)

    const store = await createBookmarkStore(storage)

    const repaired = store.getState()
    expect(repaired.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, 'g-x'])
    expectInvariants(repaired)
    // 修复也写回存储,新开的库实例看到同一结果
    const reopened = await createBookmarkStore(storage)
    expect(reopened.getState().groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, 'g-x'])
  })
})
