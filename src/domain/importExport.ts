import type { BookmarkState } from './types'

/**
 * 导入导出:双格式(JSON 完整备份 / Netscape HTML 通用迁移)双向。
 * 全部为纯函数;导入经注入的存储适配器读写,与手动添加共用 normalizeUrl 判重。
 */

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
