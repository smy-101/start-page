import { describe, expect, it } from 'vitest'
import type { BookmarkState } from './types'
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID } from './types'
import { createMemoryStorage } from '../storage/memoryStorage'
import { createBookmarkStore } from './store'
import { IMPORTED_GROUP_COLOR } from './importExport'
import { importNativeBookmarks, parseNativeBookmarkTree } from './nativeImport'
import type { NativeBookmarkNode } from './nativeImport'

/**
 * 原生书签树 fixture:模拟 chrome.bookmarks.getTree() 的真实形态
 * (根 id "0" + 固定根 书签栏/其他书签/移动设备书签,research 笔记 §7)。
 */
const chromeTree: NativeBookmarkNode[] = [
  {
    id: '0',
    title: '',
    children: [
      {
        // 书签栏:散项 + 子文件夹 + 空子文件夹(Chrome 用户的典型组织)
        title: '书签栏',
        children: [
          { title: 'Gmail', url: 'https://mail.google.com/' },
          { title: 'GitHub', url: 'https://github.com/' },
          {
            title: '工作',
            children: [
              { title: '看板', url: 'https://board.example.com/' },
              { title: '文档', url: 'https://docs.example.com/' },
            ],
          },
          { title: '空文件夹', children: [] },
        ],
      },
      { title: '其他书签', children: [] },
      { title: '移动设备书签', children: [] },
    ],
  },
]

describe('原生书签树解析(纯函数)', () => {
  it('Chrome 真实根结构:每个有直接书签的文件夹→分组(父组先于子组),空的固定根不产生分组', () => {
    const parsed = parseNativeBookmarkTree(chromeTree)

    if (!parsed.ok) throw new Error('应解析成功')
    expect(parsed.value.inbox).toEqual([])
    expect(parsed.value.groups).toEqual([
      {
        name: '书签栏',
        bookmarks: [
          { url: 'https://mail.google.com/', title: 'Gmail', note: '' },
          { url: 'https://github.com/', title: 'GitHub', note: '' },
        ],
      },
      {
        name: '工作',
        bookmarks: [
          { url: 'https://board.example.com/', title: '看板', note: '' },
          { url: 'https://docs.example.com/', title: '文档', note: '' },
        ],
      },
    ])
    const names = parsed.value.groups.map((g) => g.name)
    expect(names).not.toContain('其他书签')
    expect(names).not.toContain('移动设备书签')
    expect(names).not.toContain('空文件夹')
  })

  it('根下散项(不属于任何文件夹)→收集箱', () => {
    const tree: NativeBookmarkNode[] = [
      {
        title: '',
        children: [
          { title: '直存', url: 'https://quick.example.com/' },
          { title: '书签栏', children: [{ title: 'Gmail', url: 'https://mail.google.com/' }] },
        ],
      },
    ]

    const parsed = parseNativeBookmarkTree(tree)

    if (!parsed.ok) throw new Error('应解析成功')
    expect(parsed.value.inbox).toEqual([
      { url: 'https://quick.example.com/', title: '直存', note: '' },
    ])
    expect(parsed.value.groups.map((g) => g.name)).toEqual(['书签栏'])
  })

  it('只有子文件夹、无直接书签的文件夹自身不产生分组,子文件夹照常成组', () => {
    const tree: NativeBookmarkNode[] = [
      {
        title: '',
        children: [
          {
            title: '其他书签',
            children: [{ title: '归档', children: [{ title: '旧文', url: 'https://old.example.com/' }] }],
          },
        ],
      },
    ]

    const parsed = parseNativeBookmarkTree(tree)

    if (!parsed.ok) throw new Error('应解析成功')
    expect(parsed.value.groups).toEqual([
      { name: '归档', bookmarks: [{ url: 'https://old.example.com/', title: '旧文', note: '' }] },
    ])
  })

  it('空标题文件夹回退「未命名分组」(与 HTML 导入同规则)', () => {
    const tree: NativeBookmarkNode[] = [
      {
        title: '',
        children: [{ title: '', children: [{ title: '无名', url: 'https://noname.example.com/' }] }],
      },
    ]

    const parsed = parseNativeBookmarkTree(tree)

    if (!parsed.ok) throw new Error('应解析成功')
    expect(parsed.value.groups.map((g) => g.name)).toEqual(['未命名分组'])
  })

  it('整树无任何可导入书签时判为无效', () => {
    expect(parseNativeBookmarkTree([])).toEqual({ ok: false, error: 'invalid-import' })
    expect(parseNativeBookmarkTree([{ title: '', children: [] }])).toEqual({
      ok: false,
      error: 'invalid-import',
    })
  })
})

describe('原生书签导入(合并入状态)', () => {
  it('顶层文件夹→新建分组(默认导入色),散项→收集箱,统计新增/跳过;重复导入全部跳过', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    // 预置一条与原生书签重复的收藏:URL 判重跳过走唯一 normalizeUrl 路径
    await store.addBookmark({ url: 'https://github.com/x', title: 'GitHub 备份' })
    const tree: NativeBookmarkNode[] = [
      {
        title: '',
        children: [
          { title: '直存', url: 'https://quick.example.com/' },
          {
            title: '书签栏',
            children: [
              { title: 'GitHub', url: 'https://github.com/x#top' }, // 与预置同 URL(规范化后相同)
              { title: 'Gmail', url: 'https://mail.google.com/' },
              { title: '小书签', url: 'javascript:void(0)' }, // 非可收藏 URL,跳过
            ],
          },
        ],
      },
    ]

    const result = await importNativeBookmarks(adapter, tree)

    if (!result.ok) throw new Error('应导入成功')
    expect(result.value).toEqual({ added: 2, skipped: 2 })

    const state = (await adapter.load()) as BookmarkState
    const names = state.groups.map((g) => g.name)
    expect(names).toContain('收集箱')
    expect(names).toContain('书签栏')
    const barGroup = state.groups.find((g) => g.name === '书签栏')
    if (!barGroup) throw new Error('书签栏分组应存在')
    expect(barGroup.color).toBe(IMPORTED_GROUP_COLOR)
    // 导入统一存 normalizeUrl 后的 URL(根路径去尾斜杠)
    expect(state.bookmarks.find((b) => b.url === 'https://mail.google.com')?.groupId).toBe(barGroup.id)
    expect(state.bookmarks.find((b) => b.url === 'https://quick.example.com')?.groupId).toBe(
      INBOX_GROUP_ID,
    )

    // 第二次导入同一棵树:全部判重跳过,不产生重复收藏
    const again = await importNativeBookmarks(adapter, tree)
    if (!again.ok) throw new Error('应再次导入成功')
    expect(again.value).toEqual({ added: 0, skipped: 4 })
  })

  it('与现有分组同名时并入现有分组(沿用 HTML 导入的并组语义)', async () => {
    const adapter = createMemoryStorage()
    const store = await createBookmarkStore(adapter)
    const created = await store.createGroup({ name: '工作', color: '#ec4899' })
    if (!created.ok) throw new Error('fixture setup failed')

    const result = await importNativeBookmarks(adapter, [
      {
        title: '',
        children: [
          {
            title: '工作',
            children: [{ title: '看板', url: 'https://board.example.com/' }],
          },
        ],
      },
    ])

    if (!result.ok) throw new Error('应导入成功')
    expect(result.value).toEqual({ added: 1, skipped: 0 })
    const state = (await adapter.load()) as BookmarkState
    const workGroup = state.groups.find((g) => g.name === '工作')
    if (!workGroup) throw new Error('工作分组应存在')
    expect(workGroup.id).toBe(created.value.id) // 并入现有分组,未新建
    expect(workGroup.color).toBe('#ec4899') // 现有分组颜色不变
    expect(state.bookmarks.find((b) => b.url === 'https://board.example.com')?.groupId).toBe(workGroup.id)
    expect(state.groups.filter((g) => g.name === '工作')).toHaveLength(1)
  })

  it('空树导入判为无效,不写入', async () => {
    const adapter = createMemoryStorage()
    await createBookmarkStore(adapter)
    const before = await adapter.load()

    const result = await importNativeBookmarks(adapter, [{ title: '', children: [] }])

    expect(result).toEqual({ ok: false, error: 'invalid-import' })
    expect(await adapter.load()).toEqual(before)
  })

  it('收集箱项与分组项并存时全部按预期落位', async () => {
    const adapter = createMemoryStorage()
    await createBookmarkStore(adapter)

    const result = await importNativeBookmarks(adapter, chromeTree)

    if (!result.ok) throw new Error('应导入成功')
    expect(result.value).toEqual({ added: 4, skipped: 0 })
    const state = (await adapter.load()) as BookmarkState
    expect(state.groups.map((g) => g.name)).toEqual(['收集箱', '书签栏', '工作'])
    expect(state.groups.find((g) => g.id === INBOX_GROUP_ID)?.color).toBe(INBOX_GROUP_COLOR)
    expect(state.bookmarks).toHaveLength(4)
  })
})
