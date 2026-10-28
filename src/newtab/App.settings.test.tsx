import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from '../domain/types'
import { INBOX_GROUP_ID } from '../domain/types'
import type { NativeBookmarkNode } from '../domain/nativeImport'
import type { SettingsAdapter } from './settings'
import { createMemorySettingsStorage } from './settings'
import { createMemoryStorage } from '../storage/memoryStorage'
import { App } from './App'

/** 模拟 chrome.bookmarks.getTree() 的真实形态(根 + 书签栏/其他书签/移动设备书签 + 根下散项)。 */
const chromeTree: NativeBookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      { title: '直存', url: 'https://quick.example.com/' },
      {
        title: '书签栏',
        children: [
          { title: 'Gmail', url: 'https://mail.google.com/' },
          {
            title: '工作',
            children: [{ title: '看板', url: 'https://board.example.com/' }],
          },
        ],
      },
      { title: '其他书签', children: [] },
      { title: '移动设备书签', children: [] },
    ],
  },
]

async function renderApp(
  overrides: {
    adapter?: StorageAdapter
    settingsAdapter?: SettingsAdapter
    getBookmarkTree?: () => Promise<NativeBookmarkNode[]>
  } = {},
) {
  const adapter = overrides.adapter ?? createMemoryStorage()
  const settingsAdapter = overrides.settingsAdapter ?? createMemorySettingsStorage()
  const getBookmarkTree = overrides.getBookmarkTree ?? (async () => chromeTree)
  const view = render(
    <App adapter={adapter} settingsAdapter={settingsAdapter} getBookmarkTree={getBookmarkTree} />,
  )
  await screen.findByRole('button', { name: '设置' })
  return { adapter, settingsAdapter, unmount: view.unmount }
}

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: '设置' }))
  await screen.findByRole('heading', { name: '设置' })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('设置页入口与迁入', () => {
  it('初始页右上角齿轮进入中文设置页;返回按钮回到初始页', async () => {
    await renderApp()

    await openSettings()

    expect(screen.getByRole('heading', { name: '搜索引擎' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '从浏览器书签导入' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '导入导出' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回初始页' }))
    expect(await screen.findByRole('heading', { name: '初始页' })).toBeInTheDocument()
  })

  it('初始页头部只保留齿轮:导入导出不再直接暴露,收纳于设置页', async () => {
    await renderApp()

    expect(screen.queryByRole('region', { name: '导入导出' })).toBeNull()
    expect(screen.queryByRole('button', { name: '导出 JSON' })).toBeNull()
    expect(screen.queryByRole('button', { name: '从浏览器书签导入' })).toBeNull()

    await openSettings()
    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeInTheDocument()
  })
})

describe('搜索引擎设置', () => {
  it('默认必应;改选百度返回初始页后,回车立即按百度搜索', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    await renderApp()

    await openSettings()
    expect(screen.getByLabelText('必应')).toBeChecked()
    fireEvent.click(screen.getByLabelText('百度'))
    fireEvent.click(screen.getByRole('button', { name: '返回初始页' }))
    await screen.findByRole('heading', { name: '初始页' })

    fireEvent.change(screen.getByLabelText('搜索收藏'), { target: { value: '起始页' } })
    fireEvent.keyDown(screen.getByLabelText('搜索收藏'), { key: 'Enter' })

    expect(open).toHaveBeenCalledWith(
      'https://www.baidu.com/s?wd=%E8%B5%B7%E5%A7%8B%E9%A1%B5',
      '_blank',
      'noopener',
    )
  })

  it('设置持久化:重开浏览器(同适配器重新挂载)后引擎仍为百度', async () => {
    const settingsAdapter = createMemorySettingsStorage()
    const { unmount } = await renderApp({ settingsAdapter })

    await openSettings()
    fireEvent.click(screen.getByLabelText('百度'))
    unmount()
    expect(await settingsAdapter.load()).toEqual({ engine: 'baidu' })

    // 模拟重开浏览器:同一持久化适配器,全新页面
    render(
      <App
        adapter={createMemoryStorage()}
        settingsAdapter={settingsAdapter}
        getBookmarkTree={async () => chromeTree}
      />,
    )
    await screen.findByRole('button', { name: '设置' })
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByLabelText('百度')).toBeChecked()
    expect(screen.getByLabelText('必应')).not.toBeChecked()
  })
})

describe('从浏览器书签导入', () => {
  it('一键导入:报告新增/跳过统计,顶层文件夹成组、散项进收集箱,返回初始页可见', async () => {
    const { adapter } = await renderApp({ getBookmarkTree: async () => chromeTree })

    await openSettings()
    fireEvent.click(screen.getByRole('button', { name: '从浏览器书签导入' }))

    expect(await screen.findByText('新增 3 条、跳过 0 条')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回初始页' }))
    expect(await screen.findByRole('heading', { name: '书签栏' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '工作' })).toBeInTheDocument()
    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '其他书签' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '移动设备书签' })).toBeNull()
    const state = await adapter.load()
    if (!state) throw new Error('导入后应有状态')
    expect(state.bookmarks.find((b) => b.title === '直存')?.groupId).toBe(INBOX_GROUP_ID)

    // 再次导入:全部判重跳过
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    fireEvent.click(await screen.findByRole('button', { name: '从浏览器书签导入' }))
    expect(await screen.findByText('新增 0 条、跳过 3 条')).toBeInTheDocument()
  })

  it('书签为空:中文提示且不写入', async () => {
    const { adapter } = await renderApp({
      getBookmarkTree: async () => [{ id: '0', title: '', children: [] }],
    })
    const before = await adapter.load()

    await openSettings()
    fireEvent.click(screen.getByRole('button', { name: '从浏览器书签导入' }))

    expect(await screen.findByText('浏览器书签为空,没有可导入的书签')).toBeInTheDocument()
    expect(await adapter.load()).toEqual(before)
  })

  it('读取浏览器书签失败:中文提示', async () => {
    await renderApp({
      getBookmarkTree: async () => {
        throw new Error('bookmarks API unavailable')
      },
    })

    await openSettings()
    fireEvent.click(screen.getByRole('button', { name: '从浏览器书签导入' }))

    expect(await screen.findByText('读取浏览器书签失败,请稍后重试')).toBeInTheDocument()
  })
})
