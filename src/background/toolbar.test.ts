import { describe, expect, it } from 'vitest'
import { createBookmarkStore } from '../domain/store'
import { createMemoryStorage } from '../storage/memoryStorage'
import { toolbarStateFor } from './toolbar'

describe('工具栏图标状态判定(toolbarStateFor)', () => {
  it('chrome:// 等特殊页面与拿不到 URL 的标签页呈不可收藏态', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    expect(toolbarStateFor('chrome://settings', store)).toEqual({ kind: 'unbookmarkable' })
    expect(toolbarStateFor('edge://favorites', store)).toEqual({ kind: 'unbookmarkable' })
    expect(toolbarStateFor('about:blank', store)).toEqual({ kind: 'unbookmarkable' })
    expect(toolbarStateFor('chrome-extension://abc/newtab.html', store)).toEqual({
      kind: 'unbookmarkable',
    })
    expect(toolbarStateFor(undefined, store)).toEqual({ kind: 'unbookmarkable' })
  })

  it('可收藏但未收藏的页面呈未收藏态', async () => {
    const store = await createBookmarkStore(createMemoryStorage())

    expect(toolbarStateFor('https://Example.com/#top', store)).toEqual({ kind: 'unfavorited' })
  })

  it('已收藏页面呈已收藏态,并带回该收藏供点击取消', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    const added = await store.addBookmark({ url: 'https://example.com', title: '示例站' })
    if (!added.ok) throw new Error('fixture setup failed')

    const state = toolbarStateFor('HTTPS://Example.com#frag', store)

    // 判定走规范化 URL:大小写与 fragment 差异不影响命中
    expect(state).toEqual({ kind: 'favorited', bookmark: added.value })
  })

  it('收藏被取消后回到未收藏态(同一 URL)', async () => {
    const store = await createBookmarkStore(createMemoryStorage())
    const added = await store.addBookmark({ url: 'https://example.com' })
    if (!added.ok) throw new Error('fixture setup failed')

    await store.removeBookmark(added.value.id)

    expect(toolbarStateFor('https://example.com', store)).toEqual({ kind: 'unfavorited' })
  })
})
