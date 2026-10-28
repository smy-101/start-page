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
