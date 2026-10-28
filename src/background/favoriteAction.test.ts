import { describe, expect, it } from 'vitest'
import { createBookmarkStore } from '../domain/store'
import type { BookmarkStore } from '../domain/store'
import { createMemoryStorage } from '../storage/memoryStorage'
import { favoriteToGroup, unfavoriteByUrl } from './favoriteAction'

/** 右键菜单点击语义(纯逻辑,不碰 chrome):菜单接线层只做事件 → 这些函数的翻译。 */
describe('右键收藏到组 favoriteToGroup', () => {
  async function storeWithGroup(): Promise<{ store: BookmarkStore; groupId: string }> {
    const store = await createBookmarkStore(createMemoryStorage())
    const group = await store.createGroup({ name: '工作', color: '#e99695' })
    if (!group.ok) throw new Error('fixture setup failed')
    return { store, groupId: group.value.id }
  }

  it('未收藏页:收藏到指定组,URL 规范化、标题留空回退主机名', async () => {
    const { store, groupId } = await storeWithGroup()

    const result = await favoriteToGroup(store, 'HTTPS://Example.com/#top', undefined, groupId)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ url: 'https://example.com', title: 'example.com', groupId })
    expect(store.getState().bookmarks).toHaveLength(1)
  })

  it('已收藏于另一组再选别的组:视为移动,不产生第二条(单属不变量)', async () => {
    const { store, groupId } = await storeWithGroup()
    const added = await store.addBookmark({ url: 'https://example.com', title: '示例' })
    if (!added.ok) throw new Error('fixture setup failed')

    const result = await favoriteToGroup(store, 'https://example.com/#frag', undefined, groupId)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.id).toBe(added.value.id)
    expect(result.value.groupId).toBe(groupId)
    const same = store.getState().bookmarks.filter((b) => b.url === 'https://example.com')
    expect(same).toHaveLength(1)
    expect(same[0].groupId).toBe(groupId)
  })
})

describe('右键取消收藏 unfavoriteByUrl', () => {
  it('已收藏页:删除该收藏(按规范化 URL 匹配)并返回它', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    const added = await store.addBookmark({ url: 'https://example.com', title: '示例' })
    if (!added.ok) throw new Error('fixture setup failed')

    const removed = await unfavoriteByUrl(store, 'HTTPS://EXAMPLE.com/#x')

    expect(removed).toEqual(added.value)
    expect(store.getState().bookmarks).toEqual([])
  })

  it('未收藏页(或非可收藏 URL):无动作,返回 null', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    await store.addBookmark({ url: 'https://example.com', title: '示例' })

    expect(await unfavoriteByUrl(store, 'https://other.example.com')).toBeNull()
    expect(await unfavoriteByUrl(store, 'chrome://settings')).toBeNull()
    expect(store.getState().bookmarks).toHaveLength(1)
  })
})
