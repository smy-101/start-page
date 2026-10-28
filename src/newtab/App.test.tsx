import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { createMemoryStorage } from '../storage/memoryStorage'
import { createBookmarkStore } from '../domain/store'

async function renderApp() {
  render(<App adapter={createMemoryStorage()} />)
  await screen.findByRole('heading', { name: '收集箱' })
}

async function addBookmark(url: string, title: string, note = '') {
  fireEvent.change(screen.getByLabelText('网址'), { target: { value: url } })
  fireEvent.change(screen.getByLabelText('标题'), { target: { value: title } })
  if (note) fireEvent.change(screen.getByLabelText('备注'), { target: { value: note } })
  fireEvent.click(screen.getByRole('button', { name: '添加收藏' }))
}

describe('初始页:添加收藏到收集箱', () => {
  it('空收集箱渲染分组标题与空状态提示', async () => {
    await renderApp()

    expect(screen.getByRole('heading', { name: '收集箱' })).toBeInTheDocument()
    expect(screen.getByText('还没有收藏')).toBeInTheDocument()
  })

  it('填写网址/标题/备注提交后,收藏卡片出现在收集箱,表单清空', async () => {
    await renderApp()

    await addBookmark('https://example.com', '示例站', '第一条')

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('示例站')).toBeInTheDocument()
    expect(within(card).getByText('https://example.com')).toBeInTheDocument()
    expect(within(card).getByText('第一条')).toBeInTheDocument()
    expect(screen.getByLabelText('网址')).toHaveValue('')
  })

  it('重复 URL 添加被拒,界面给出中文提示', async () => {
    await renderApp()
    await addBookmark('https://example.com', '第一条')
    await screen.findByRole('listitem')

    await addBookmark('HTTPS://EXAMPLE.com/#x', '第二条')

    expect(await screen.findByText('该网址已在收藏中')).toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]).getByText('第一条')).toBeInTheDocument()
  })

  it('无效网址被拒,界面给出中文提示且不产生收藏', async () => {
    await renderApp()

    await addBookmark('不是网址', '无效')

    expect(await screen.findByText('网址无效,请输入完整网址')).toBeInTheDocument()
    expect(screen.getByText('还没有收藏')).toBeInTheDocument()
  })
})

describe('初始页:添加与编辑选分组(spec 故事 17/24)', () => {
  async function createGroup(name: string) {
    fireEvent.change(screen.getByLabelText('分组名'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }))
    return screen.findByRole('region', { name })
  }

  function pickGroup(scope: HTMLElement, groupName: string) {
    const select = within(scope).getByLabelText('所属分组')
    const option = within(select).getByRole('option', { name: groupName }) as HTMLOptionElement
    fireEvent.change(select, { target: { value: option.value } })
  }

  it('手动添加选分组:收藏落到所选分组而非收集箱', async () => {
    await renderApp()
    const work = await createGroup('工作')

    pickGroup(document.body, '工作')
    await addBookmark('https://work.example.com', '工作站')

    expect(await within(work).findByText('工作站')).toBeInTheDocument()
    expect(within(work).getAllByRole('listitem')).toHaveLength(1)
    const inbox = screen.getByRole('region', { name: '收集箱' })
    expect(within(inbox).queryByRole('listitem')).toBeNull()
    expect(within(inbox).getByText('还没有收藏')).toBeInTheDocument()
  })

  it('编辑改所属分组:保存后收藏移到目标分组,原组不再有该卡片', async () => {
    await renderApp()
    const work = await createGroup('工作')
    await addBookmark('https://move.example.com', '待移动')

    const card = await screen.findByRole('listitem')
    fireEvent.click(within(card).getByRole('button', { name: '编辑' }))
    pickGroup(card, '工作')
    fireEvent.click(within(card).getByRole('button', { name: '保存' }))

    expect(await within(work).findByText('待移动')).toBeInTheDocument()
    expect(within(work).getAllByRole('listitem')).toHaveLength(1)
    const inbox = screen.getByRole('region', { name: '收集箱' })
    expect(within(inbox).queryByRole('listitem')).toBeNull()
    expect(within(inbox).getByText('还没有收藏')).toBeInTheDocument()
  })
})

describe('初始页:跨上下文同步', () => {
  it('其他上下文(如工具栏 service worker)写入后,已打开的初始页即时刷新', async () => {
    const storage = createMemoryStorage()
    render(<App adapter={storage} />)
    await screen.findByText('还没有收藏')

    const toolbarContext = await createBookmarkStore(storage)
    await toolbarContext.addBookmark({ url: 'https://example.com', title: '工具栏收藏' })

    const card = await screen.findByText('工具栏收藏')
    expect(card).toBeInTheDocument()

    const found = toolbarContext.findBookmarkByUrl('https://example.com')
    if (!found) throw new Error('fixture setup failed')
    await toolbarContext.removeBookmark(found.id)

    expect(await screen.findByText('还没有收藏')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('初始页:收藏卡片', () => {
  it('点击卡片在新标签页打开网页', async () => {
    await renderApp()
    await addBookmark('https://example.com', '示例站')

    const link = await screen.findByRole('link', { name: /示例站/ })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('编辑标题/备注保存后卡片更新', async () => {
    await renderApp()
    await addBookmark('https://example.com', '旧标题')
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    const card = screen.getByRole('listitem')

    fireEvent.change(within(card).getByLabelText('标题'), { target: { value: '新标题' } })
    fireEvent.click(within(card).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('新标题')).toBeInTheDocument()
    expect(screen.queryByText('旧标题')).toBeNull()
  })

  it('编辑时把 URL 改成重复值,提示且保留原值', async () => {
    await renderApp()
    await addBookmark('https://a.example.com', 'A')
    await addBookmark('https://b.example.com', 'B')
    const cards = await screen.findAllByRole('listitem')
    expect(cards).toHaveLength(2)

    const card = screen.getAllByRole('listitem')[0]
    fireEvent.click(within(card).getByRole('button', { name: '编辑' }))
    fireEvent.change(within(card).getByLabelText('网址'), { target: { value: 'https://b.example.com' } })
    fireEvent.click(within(card).getByRole('button', { name: '保存' }))

    expect(await within(card).findByText('该网址已在收藏中')).toBeInTheDocument()
    // 被拒后留在编辑表单;取消可见原收藏未被改动
    fireEvent.click(within(card).getByRole('button', { name: '取消' }))
    expect(within(card).getByText('A')).toBeInTheDocument()
    expect(within(card).getByText('https://a.example.com')).toBeInTheDocument()
  })

  it('删除收藏后卡片消失,空状态恢复', async () => {
    await renderApp()
    await addBookmark('https://example.com', '示例站')

    fireEvent.click(await screen.findByRole('button', { name: '删除' }))

    expect(await screen.findByText('还没有收藏')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
