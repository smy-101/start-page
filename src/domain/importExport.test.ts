import { describe, expect, it } from 'vitest'
import type { BookmarkState } from './types'
import { INBOX_GROUP_ID } from './types'
import { exportStateAsHtml, exportStateAsJson } from './importExport'

/** 与实现无耦合的字面量状态:导出/导入回环的独立真值来源。 */
export function literalState(): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      { id: INBOX_GROUP_ID, name: '收集箱', color: '#3b82f6', order: 0 },
      { id: 'g-work', name: '工作', color: '#f97316', order: 1 },
      { id: 'g-dev', name: '开发', color: '#22c55e', order: 2 },
    ],
    bookmarks: [
      {
        id: 'b-1',
        url: 'https://example.com',
        title: '示例站',
        note: '第一条备注',
        groupId: INBOX_GROUP_ID,
        order: 0,
      },
      {
        id: 'b-2',
        url: 'https://git.example.com/org/repo?tab=readme',
        title: '代码仓库',
        note: '',
        groupId: 'g-work',
        order: 0,
      },
      {
        id: 'b-3',
        url: 'http://localhost:5173',
        title: '本地开发服',
        note: '仅本机',
        groupId: 'g-dev',
        order: 0,
      },
    ],
  }
}

describe('导出 JSON:完整状态逐字备份', () => {
  it('导出内容 JSON.parse 后与原状态深度相等(含 schemaVersion/颜色/顺序/备注)', () => {
    const state = literalState()

    const raw = exportStateAsJson(state)

    expect(JSON.parse(raw)).toEqual(state)
    expect(JSON.parse(raw).schemaVersion).toBe(1)
  })
})

describe('导出 HTML:Netscape 书签格式', () => {
  it('首行为 Netscape DOCTYPE 声明,分组映射为一层文件夹,书签在对应文件夹内', () => {
    const raw = exportStateAsHtml(literalState())

    expect(raw.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>')).toBe(true)
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    const folders = [...doc.querySelectorAll('h3')].map((h3) => h3.textContent)
    expect(folders).toEqual(['收集箱', '工作', '开发'])
    const links = [...doc.querySelectorAll('a')].map((a) => ({
      href: a.getAttribute('href'),
      title: a.textContent,
    }))
    expect(links).toEqual([
      { href: 'https://example.com', title: '示例站' },
      { href: 'https://git.example.com/org/repo?tab=readme', title: '代码仓库' },
      { href: 'http://localhost:5173', title: '本地开发服' },
    ])
  })

  it('书签嵌套在所属分组文件夹之下(书签不在根层)', () => {
    const raw = exportStateAsHtml(literalState())

    const doc = new DOMParser().parseFromString(raw, 'text/html')
    const rootDl = doc.querySelector('dl')
    // 根层只有分组文件夹的 DT,没有直接的 A
    for (const dt of [...rootDl!.children]) {
      if (dt.tagName === 'DT') expect(dt.querySelector(':scope > a')).toBeNull()
    }
    // 每个分组文件夹的 DL 内书签数与状态一致
    const devFolder = [...doc.querySelectorAll('h3')].find((h3) => h3.textContent === '开发')!
    const devDl = devFolder.closest('dt')!.querySelector(':scope > dl')!
    expect(devDl.querySelectorAll('a')).toHaveLength(1)
  })

  it('备注写成书签后随的 <DD>,特殊字符(&、<、")被转义', () => {
    const state = literalState()
    state.bookmarks[0].note = 'Tom & Jerry <"贵宾">'
    state.groups[1].name = '研发&运维'

    const raw = exportStateAsHtml(state)

    expect(raw).toContain('<DD>Tom &amp; Jerry &lt;"贵宾"&gt;')
    expect(raw).toContain('<H3>研发&amp;运维</H3>')
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    const dt = [...doc.querySelectorAll('dt')].find((el) =>
      el.querySelector(':scope > a')?.getAttribute('href')?.startsWith('https://example.com'),
    )!
    expect(dt.nextElementSibling!.tagName).toBe('DD')
    expect(dt.nextElementSibling!.textContent!.trim()).toBe('Tom & Jerry <"贵宾">')
  })
})
