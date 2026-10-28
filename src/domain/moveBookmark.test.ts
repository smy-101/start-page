import { describe, expect, it } from 'vitest'
import { INBOX_GROUP_ID, createBookmarkStore } from './store'
import { createMemoryStorage } from '../storage/memoryStorage'

/** 右键「选择其他组 = 移动」所依赖的领域操作(单属不变量由领域层保证)。 */
describe('跨组移动收藏 moveBookmark', () => {
  it('移到另一分组:groupId 变更、在新组内 order 追加末尾,并持久化', async () => {
    const storage = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const work = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!work.ok) throw new Error('fixture setup failed')
    await store.addBookmark({ url: 'https://a.example.com', groupId: work.value.id })
    const added = await store.addBookmark({ url: 'https://b.example.com', groupId: work.value.id })
    if (!added.ok) throw new Error('fixture setup failed')

    const moved = await store.moveBookmark(added.value.id, INBOX_GROUP_ID)

    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.value).toMatchObject({ id: added.value.id, groupId: INBOX_GROUP_ID, order: 0 })
    const state = store.getState()
    expect(state.bookmarks.find((b) => b.id === added.value.id)?.groupId).toBe(INBOX_GROUP_ID)
    expect((await createBookmarkStore(storage)).getState().bookmarks).toEqual(state.bookmarks)
  })

  it('移到所在分组:无操作成功,数据与持久层不变', async () => {
    const storage = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const added = await store.addBookmark({ url: 'https://example.com', title: '示例' })
    if (!added.ok) throw new Error('fixture setup failed')
    const before = store.getState()

    const moved = await store.moveBookmark(added.value.id, INBOX_GROUP_ID)

    expect(moved).toEqual({ ok: true, value: added.value })
    expect(store.getState()).toBe(before)
  })

  it('收藏不存在 / 目标分组不存在被拒;移动后仅属目标组(单属不变量)', async () => {
    const storage = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const a = await store.createGroup({ name: 'A组', color: '#e99695' })
    const b = await store.createGroup({ name: 'B组', color: '#67c23a' })
    if (!a.ok || !b.ok) throw new Error('fixture setup failed')
    const added = await store.addBookmark({ url: 'https://example.com', groupId: a.value.id })
    if (!added.ok) throw new Error('fixture setup failed')

    expect(await store.moveBookmark('ghost', b.value.id)).toEqual({ ok: false, error: 'bookmark-not-found' })
    expect(await store.moveBookmark(added.value.id, 'nope')).toEqual({ ok: false, error: 'group-not-found' })

    const moved = await store.moveBookmark(added.value.id, b.value.id)
    expect(moved.ok).toBe(true)
    const inA = store.getState().bookmarks.filter((bm) => bm.id === added.value.id && bm.groupId === a.value.id)
    const inB = store.getState().bookmarks.filter((bm) => bm.id === added.value.id && bm.groupId === b.value.id)
    expect(inA).toHaveLength(0)
    expect(inB).toHaveLength(1)
  })
})
