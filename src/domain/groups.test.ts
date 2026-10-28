import { describe, expect, it } from 'vitest'
import { INBOX_GROUP_ID, createBookmarkStore } from './store'
import { createMemoryStorage } from '../storage/memoryStorage'
import type { StorageAdapter } from './types'

/** 三组夹具:收集箱 + 工作 + 资讯(按此顺序)。 */
async function storeWithGroups() {
  const store = await createBookmarkStore(createMemoryStorage())
  const work = await store.createGroup({ name: '工作', color: '#e99695' })
  const news = await store.createGroup({ name: '资讯', color: '#9fe295' })
  if (!work.ok || !news.ok) throw new Error('fixture setup failed')
  return { store, workId: work.value.id, newsId: news.value.id }
}

describe('重命名分组', () => {
  it('重命名为修剪后的新名字,即时生效并落盘', async () => {
    const storage: StorageAdapter = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const created = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!created.ok) throw new Error('fixture setup failed')

    const renamed = await store.renameGroup(created.value.id, ' 办公 ')

    expect(renamed.ok).toBe(true)
    if (renamed.ok) expect(renamed.value).toMatchObject({ id: created.value.id, name: '办公' })
    expect(store.getState().groups.find((g) => g.id === created.value.id)?.name).toBe('办公')
    const reopened = await createBookmarkStore(storage)
    expect(reopened.getState().groups.find((g) => g.id === created.value.id)?.name).toBe('办公')
  })

  it('空名被拒;不存在的分组被拒;收集箱不可改名', async () => {
    const { store, workId } = await storeWithGroups()

    expect(await store.renameGroup(workId, '   ')).toEqual({ ok: false, error: 'empty-group-name' })
    expect(await store.renameGroup('ghost', '新名')).toEqual({ ok: false, error: 'group-not-found' })
    expect(await store.renameGroup(INBOX_GROUP_ID, '别的名字')).toEqual({
      ok: false,
      error: 'inbox-immutable',
    })
    expect(store.getState().groups.find((g) => g.id === INBOX_GROUP_ID)?.name).toBe('收集箱')
  })
})

describe('修改分组颜色', () => {
  it('换色为修剪后的新颜色,即时生效并落盘', async () => {
    const storage: StorageAdapter = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const created = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!created.ok) throw new Error('fixture setup failed')

    const recolored = await store.recolorGroup(created.value.id, ' #9fe295 ')

    expect(recolored.ok).toBe(true)
    if (recolored.ok) expect(recolored.value).toMatchObject({ id: created.value.id, color: '#9fe295' })
    expect(store.getState().groups.find((g) => g.id === created.value.id)?.color).toBe('#9fe295')
    const reopened = await createBookmarkStore(storage)
    expect(reopened.getState().groups.find((g) => g.id === created.value.id)?.color).toBe('#9fe295')
  })

  it('空色被拒;不存在的分组被拒;收集箱不可换色', async () => {
    const { store, workId } = await storeWithGroups()

    expect(await store.recolorGroup(workId, '   ')).toEqual({ ok: false, error: 'empty-group-color' })
    expect(await store.recolorGroup('ghost', '#123456')).toEqual({ ok: false, error: 'group-not-found' })
    expect(await store.recolorGroup(INBOX_GROUP_ID, '#123456')).toEqual({
      ok: false,
      error: 'inbox-immutable',
    })
    expect(store.getState().groups.find((g) => g.id === INBOX_GROUP_ID)?.color).toBe('#3b82f6')
  })
})

describe('组间排序', () => {
  it('传入全部 id 的新顺序,分组数组与 order 均重排为 0..n-1 并落盘', async () => {
    const storage: StorageAdapter = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const work = await store.createGroup({ name: '工作', color: '#e99695' })
    const news = await store.createGroup({ name: '资讯', color: '#9fe295' })
    if (!work.ok || !news.ok) throw new Error('fixture setup failed')

    const reordered = await store.reorderGroups([news.value.id, work.value.id, INBOX_GROUP_ID])

    expect(reordered.ok).toBe(true)
    expect(store.getState().groups.map((g) => [g.id, g.order])).toEqual([
      [news.value.id, 0],
      [work.value.id, 1],
      [INBOX_GROUP_ID, 2],
    ])
    const reopened = await createBookmarkStore(storage)
    expect(reopened.getState().groups.map((g) => g.id)).toEqual([
      news.value.id,
      work.value.id,
      INBOX_GROUP_ID,
    ])
  })

  it('含未知 id 被拒;缺组或重复 id 被拒;原顺序不变', async () => {
    const { store, workId, newsId } = await storeWithGroups()

    expect(await store.reorderGroups([INBOX_GROUP_ID, workId, 'ghost'])).toEqual({
      ok: false,
      error: 'group-not-found',
    })
    expect(await store.reorderGroups([INBOX_GROUP_ID, workId])).toEqual({
      ok: false,
      error: 'invalid-group-order',
    })
    expect(await store.reorderGroups([INBOX_GROUP_ID, workId, workId, newsId])).toEqual({
      ok: false,
      error: 'invalid-group-order',
    })
    expect(store.getState().groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, workId, newsId])
  })
})

describe('删除分组:回收而非连带删除', () => {
  it('组内收藏全部回到收集箱,相对顺序保持、接在收集箱已有收藏之后,并落盘', async () => {
    const storage: StorageAdapter = createMemoryStorage()
    const store = await createBookmarkStore(storage)
    const work = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!work.ok) throw new Error('fixture setup failed')
    const stayInbox = await store.addBookmark({ url: 'https://stay.example.com' })
    const w1 = await store.addBookmark({ url: 'https://w1.example.com', groupId: work.value.id })
    const w2 = await store.addBookmark({ url: 'https://w2.example.com', groupId: work.value.id })
    if (!stayInbox.ok || !w1.ok || !w2.ok) throw new Error('fixture setup failed')

    const deleted = await store.deleteGroup(work.value.id)

    expect(deleted).toEqual({
      ok: true,
      value: { groupId: work.value.id, recycledIds: [w1.value.id, w2.value.id] },
    })
    const state = store.getState()
    expect(state.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID])
    expect(state.bookmarks).toHaveLength(3)
    const inboxBookmarks = state.bookmarks
      .filter((b) => b.groupId === INBOX_GROUP_ID)
      .sort((a, b) => a.order - b.order)
    expect(inboxBookmarks.map((b) => b.url)).toEqual([
      'https://stay.example.com',
      'https://w1.example.com',
      'https://w2.example.com',
    ])
    const reopened = await createBookmarkStore(storage)
    expect(reopened.getState().bookmarks.map((b) => b.groupId)).toEqual([
      INBOX_GROUP_ID,
      INBOX_GROUP_ID,
      INBOX_GROUP_ID,
    ])
  })

  it('空分组直接删除,不影响其他分组与其收藏', async () => {
    const { store, workId, newsId } = await storeWithGroups()
    const kept = await store.addBookmark({ url: 'https://news.example.com', groupId: newsId })
    if (!kept.ok) throw new Error('fixture setup failed')

    const deleted = await store.deleteGroup(workId)

    expect(deleted).toEqual({ ok: true, value: { groupId: workId, recycledIds: [] } })
    const state = store.getState()
    expect(state.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, newsId])
    expect(state.bookmarks.map((b) => b.url)).toEqual(['https://news.example.com'])
  })

  it('不存在的分组被拒;收集箱不可删除,状态不变', async () => {
    const { store } = await storeWithGroups()
    const before = store.getState()

    expect(await store.deleteGroup('ghost')).toEqual({ ok: false, error: 'group-not-found' })
    expect(await store.deleteGroup(INBOX_GROUP_ID)).toEqual({ ok: false, error: 'inbox-immutable' })
    expect(store.getState()).toEqual(before)
  })
})
