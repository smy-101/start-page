import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkState } from '../domain/types'
import { INBOX_GROUP_ID } from '../domain/types'
import { exportStateAsJson } from '../domain/importExport'
import { createMemoryStorage } from '../storage/memoryStorage'
import { createBookmarkStore } from '../domain/store'
import { ImportExport } from './ImportExport'
import { App } from './App'
import { createMemorySettingsStorage } from './settings'

const backup: BookmarkState = {
  schemaVersion: 1,
  groups: [
    { id: INBOX_GROUP_ID, name: '收集箱', color: '#3b82f6', order: 0 },
    { id: 'bk-design', name: '设计', color: '#ec4899', order: 1 },
  ],
  bookmarks: [
    {
      id: 'bk-1',
      url: 'https://figma.example.com',
      title: '设计工具',
      note: '导入的',
      groupId: 'bk-design',
      order: 0,
    },
  ],
}

const htmlFile = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>导入组</H3>
    <DL><p>
        <DT><A HREF="https://html.example.com/">HTML 书签</A>
    </DL><p>
</DL><p>
`

function readFileText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** jsdom 未实现 URL.createObjectURL;用可捕获 Blob 的桩替换。 */
let capturedBlob: Blob | null = null
let anchorClick: ReturnType<typeof vi.fn<() => void>>
let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>

function stubDownload() {
  capturedBlob = null
  anchorClick = vi.fn()
  createObjectURL = vi.fn((blob: Blob) => {
    capturedBlob = blob
    return 'blob:mock'
  })
  revokeObjectURL = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => anchorClick())
}

afterEach(() => {
  vi.restoreAllMocks()
  const urlStatics = URL as { createObjectURL?: unknown; revokeObjectURL?: unknown }
  delete urlStatics.createObjectURL
  delete urlStatics.revokeObjectURL
})

describe('导入导出组件(初始页设置区)', () => {
  it('提供导出/导出按钮与导入模式选择,默认合并', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)

    expect(screen.getByRole('button', { name: '导出 JSON' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出 HTML' })).toBeInTheDocument()
    expect(screen.getByLabelText('导入文件')).toBeInTheDocument()
    expect(screen.getByLabelText('合并(跳过重复)')).toBeChecked()
    expect(screen.getByLabelText('替换全部')).not.toBeChecked()
  })

  it('点击导出 JSON:生成完整状态 Blob 并触发下载', async () => {
    stubDownload()
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    await store.addBookmark({ url: 'https://example.com', title: '示例站' })
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))

    await waitFor(() => expect(anchorClick).toHaveBeenCalled())
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(await readFileText(capturedBlob!)).toBe(exportStateAsJson(store.getState()))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })

  it('点击导出 HTML:生成 Netscape 书签文件下载', async () => {
    stubDownload()
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: '导出 HTML' }))

    await waitFor(() => expect(anchorClick).toHaveBeenCalled())
    expect(await readFileText(capturedBlob!)).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
  })

  it('导入 JSON 文件(合并):报告新增/跳过并回调刷新', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    const onImported = vi.fn()
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={onImported} />)

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })

    expect(await screen.findByText('新增 1 条、跳过 0 条')).toBeInTheDocument()
    expect(onImported).toHaveBeenCalledTimes(1)
    expect((await adapter.load())!.groups.some((g) => g.name === '设计')).toBe(true)
  })

  it('导入 HTML 文件:始终按合并,重复导入同一文件全部跳过', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)
    const file = new File([htmlFile], 'bookmarks.html', { type: 'text/html' })
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })
    expect(await screen.findByText('新增 1 条、跳过 0 条')).toBeInTheDocument()

    // 重新选择同一文件也应触发导入(输入框已复位)
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })
    expect(await screen.findByText('新增 0 条、跳过 1 条')).toBeInTheDocument()
  })

  it('选择替换全部后导入 JSON:清空现有收藏恢复备份', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    await store.addBookmark({ url: 'https://old.example.com', title: '旧收藏' })
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)

    fireEvent.click(screen.getByLabelText('替换全部'))
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })

    expect(await screen.findByText('新增 1 条、跳过 0 条')).toBeInTheDocument()
    const state = await adapter.load()
    expect(state!.bookmarks.some((b) => b.url === 'https://old.example.com')).toBe(false)
    expect(state!.bookmarks.some((b) => b.url === 'https://figma.example.com')).toBe(true)
  })

  it('无效文件:中文报错且不写入', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    const before = await adapter.load()
    render(<ImportExport state={store.getState()} adapter={adapter} onImported={() => {}} />)

    const file = new File(['垃圾内容'], 'bad.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })

    expect(await screen.findByText('文件不是有效的起始页备份或书签文件')).toBeInTheDocument()
    expect(await adapter.load()).toEqual(before)
  })
})

describe('初始页接入导入导出(工单 08 起收纳于设置页)', () => {
  it('设置页可见;导入备份后返回初始页,新分组与收藏出现在页面上', async () => {
    const adapter = createMemoryStorage()
    render(
      <App
        adapter={adapter}
        settingsAdapter={createMemorySettingsStorage()}
        getBookmarkTree={async () => []}
      />,
    )

    // 初始页头部只留齿轮,导入导出收纳于设置页
    await screen.findByRole('button', { name: '设置' })
    expect(screen.queryByRole('region', { name: '导入导出' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    await screen.findByRole('region', { name: '导入导出' })

    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    fireEvent.change(screen.getByLabelText('导入文件'), { target: { files: [file] } })

    expect(await screen.findByText('新增 1 条、跳过 0 条')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回初始页' }))
    expect(await screen.findByRole('heading', { name: '设计' })).toBeInTheDocument()
    expect(screen.getByText('设计工具')).toBeInTheDocument()
  })
})
