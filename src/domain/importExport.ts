import type { BookmarkState, Result } from './types'

/**
 * 导入导出:双格式(JSON 完整备份 / Netscape HTML 通用迁移)双向。
 * 全部为纯函数;导入经注入的存储适配器读写,与手动添加共用 normalizeUrl 判重。
 */

export type ParsedBookmark = { url: string; title: string; note: string }
export type ParsedGroup = { name: string; bookmarks: ParsedBookmark[] }
/** HTML 解析结果:文件夹→分组,根级书签(不属于任何文件夹)→收集箱。 */
export type ParsedBookmarks = { inbox: ParsedBookmark[]; groups: ParsedGroup[] }

/** 导出 JSON:完整状态逐字序列化,可作为无损备份。 */
export function exportStateAsJson(state: BookmarkState): string {
  return JSON.stringify(state, null, 2)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

/**
 * 导出 HTML:Netscape 书签文件(DOCTYPE NETSCAPE-Bookmark-file-1),
 * 分组按 order 映射为一层文件夹,供 Chrome 等浏览器原生书签管理器导入。
 * 颜色与 id 无法携带(HTML 通用迁移格式,有损;无损用 JSON)。
 */
export function exportStateAsHtml(state: BookmarkState): string {
  const groups = [...state.groups].sort((a, b) => a.order - b.order)
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>起始页收藏</TITLE>',
    '<H1>起始页收藏</H1>',
    '<DL><p>',
  ]
  for (const group of groups) {
    lines.push(`    <DT><H3>${escapeHtml(group.name)}</H3>`)
    lines.push('    <DL><p>')
    const bookmarks = state.bookmarks
      .filter((bookmark) => bookmark.groupId === group.id)
      .sort((a, b) => a.order - b.order)
    for (const bookmark of bookmarks) {
      lines.push(
        `        <DT><A HREF="${escapeAttr(bookmark.url)}">${escapeHtml(bookmark.title)}</A>`,
      )
      if (bookmark.note) lines.push(`<DD>${escapeHtml(bookmark.note)}`)
    }
    lines.push('    </DL><p>')
  }
  lines.push('</DL><p>')
  return `${lines.join('\n')}\n`
}

function directChild(el: Element, tag: string): Element | null {
  for (const child of el.children) {
    if (child.tagName === tag) return child
  }
  return null
}

/** 书签的备注在 Netscape 格式中是紧随其 DT 的同级 <DD>。 */
function noteAfter(dt: Element): string {
  const next = dt.nextElementSibling
  return next && next.tagName === 'DD' ? (next.textContent ?? '').trim() : ''
}

/**
 * 解析 Netscape 书签 HTML(基于 DOMParser,可在测试环境运行):
 * 文件夹(含嵌套)→同名分组,同名合并;书签→所在文件夹的分组,根级书签→收集箱。
 * 解析不到任何文件夹与书签时视为无效文件。
 */
export function parseBookmarksHtml(html: string): Result<ParsedBookmarks> {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const parsed: ParsedBookmarks = { inbox: [], groups: [] }
  const byName = new Map<string, ParsedGroup>()

  function groupFor(name: string): ParsedGroup {
    const existing = byName.get(name)
    if (existing) return existing
    const created: ParsedGroup = { name, bookmarks: [] }
    byName.set(name, created)
    parsed.groups.push(created)
    return created
  }

  function walk(dl: Element, into: ParsedGroup | null) {
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue
      const h3 = directChild(dt, 'H3')
      if (h3) {
        const group = groupFor(h3.textContent?.trim() || '未命名分组')
        const childDl = directChild(dt, 'DL')
        if (childDl) walk(childDl, group)
        continue
      }
      const a = directChild(dt, 'A')
      if (a) {
        const bookmark: ParsedBookmark = {
          url: a.getAttribute('href') ?? '',
          title: (a.textContent ?? '').trim(),
          note: noteAfter(dt),
        }
        ;(into ? into.bookmarks : parsed.inbox).push(bookmark)
      }
    }
  }

  // 顶层 DL = 不嵌套在其他 DL 内的 DL(忽略散落的 <p> 等杂项)
  for (const dl of doc.querySelectorAll('dl')) {
    if (!dl.parentElement?.closest('dl')) walk(dl, null)
  }

  if (parsed.groups.length === 0 && parsed.inbox.length === 0) {
    return { ok: false, error: 'invalid-import' }
  }
  return { ok: true, value: parsed }
}
