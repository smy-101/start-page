import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { createMemoryStorage } from '../storage/memoryStorage'
import type { BookmarkState } from '../domain/types'
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID } from '../domain/types'

function seededState(): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      { id: INBOX_GROUP_ID, name: '收集箱', color: INBOX_GROUP_COLOR, order: 0 },
      { id: 'dev', name: '开发', color: '#8b5cf6', order: 1 },
    ],
    bookmarks: [
      {
        id: 'b1',
        url: 'https://mdn.dev/docs',
        title: 'MDN 文档',
        note: '前端参考',
        groupId: 'dev',
        order: 0,
      },
      { id: 'b2', url: 'https://shop.example.com', title: '淘宝', note: '', groupId: INBOX_GROUP_ID, order: 0 },
    ],
  }
}

async function renderSeededApp() {
  render(<App adapter={createMemoryStorage(seededState())} />)
  await screen.findByRole('heading', { name: '开发' })
}

function searchInput() {
  return screen.getByLabelText('搜索收藏')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('初始页:搜索框实时过滤', () => {
  it('输入即过滤:命中标题的收藏保留,无命中的收藏与分组隐藏,命中卡片仍可点击', async () => {
    await renderSeededApp()

    fireEvent.change(searchInput(), { target: { value: '文档' } })

    expect(screen.getByRole('heading', { name: '开发' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '收集箱' })).toBeNull()
    const link = screen.getByRole('link', { name: /MDN 文档/ })
    expect(link).toHaveAttribute('href', 'https://mdn.dev/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByText('淘宝')).toBeNull()
  })

  it('全部不匹配时显示中文空状态,搜索框仍在可继续输入', async () => {
    await renderSeededApp()

    fireEvent.change(searchInput(), { target: { value: '不存在的词' } })

    expect(screen.getByText('没有找到匹配的收藏')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '开发' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '收集箱' })).toBeNull()
    expect(searchInput()).toHaveValue('不存在的词')
  })

  it('清空输入恢复完整分组视图', async () => {
    await renderSeededApp()
    fireEvent.change(searchInput(), { target: { value: '文档' } })
    expect(screen.queryByRole('heading', { name: '收集箱' })).toBeNull()

    fireEvent.change(searchInput(), { target: { value: '' } })

    expect(screen.getByRole('heading', { name: '收集箱' })).toBeInTheDocument()
    expect(screen.getByText('淘宝')).toBeInTheDocument()
  })

  it('回车打开新标签页跳默认引擎(必应)搜索输入词', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    await renderSeededApp()

    fireEvent.change(searchInput(), { target: { value: '浏览器 起始页' } })
    fireEvent.keyDown(searchInput(), { key: 'Enter' })

    expect(open).toHaveBeenCalledWith(
      'https://www.bing.com/search?q=%E6%B5%8F%E8%A7%88%E5%99%A8%20%E8%B5%B7%E5%A7%8B%E9%A1%B5',
      '_blank',
      'noopener',
    )
  })

  it('输入为空白时回车不跳转', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    await renderSeededApp()

    fireEvent.change(searchInput(), { target: { value: '   ' } })
    fireEvent.keyDown(searchInput(), { key: 'Enter' })

    expect(open).not.toHaveBeenCalled()
  })

  it('过滤状态下编辑收藏仍走领域层,保存后按当前查询刷新', async () => {
    await renderSeededApp()
    fireEvent.change(searchInput(), { target: { value: 'MDN' } })

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    const card = screen.getByRole('listitem')
    fireEvent.change(within(card).getByLabelText('标题'), { target: { value: 'MDN 参考' } })
    fireEvent.click(within(card).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('MDN 参考')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '开发' })).toBeInTheDocument()
  })

  it('搜索时折叠分组强制展开:命中可见可点击,清空查询后恢复折叠', async () => {
    await renderSeededApp()
    const inbox = screen.getByRole('region', { name: '收集箱' })
    fireEvent.click(within(inbox).getByRole('button', { name: '折叠分组 收集箱' }))
    expect(within(inbox).queryByRole('listitem')).toBeNull()

    fireEvent.change(searchInput(), { target: { value: '淘宝' } })

    const link = screen.getByRole('link', { name: /淘宝/ })
    expect(link).toHaveAttribute('href', 'https://shop.example.com')
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.change(searchInput(), { target: { value: '' } })

    const collapsedInbox = screen.getByRole('region', { name: '收集箱' })
    expect(within(collapsedInbox).queryByRole('listitem')).toBeNull()
    expect(within(collapsedInbox).getByRole('button', { name: '展开分组 收集箱' })).toBeInTheDocument()
  })
})
