import type { Bookmark, BookmarkState, Group, Result, StorageAdapter } from './types'
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID, INBOX_GROUP_NAME, SCHEMA_VERSION } from './types'
import { normalizeUrl } from './url'

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

export type ImportMode = 'merge' | 'replace'

/** 导入结果统计:UI 据此提示「新增 N 条、跳过 M 条」。 */
export interface ImportReport {
  added: number
  skipped: number
}

/** HTML 不携带颜色,导入分组统一用此默认色。 */
export const IMPORTED_GROUP_COLOR = '#8b5cf6'

/** 待并入的分组(名→目标组),颜色仅在建新组时生效。 */
interface IncomingGroup {
  name: string
  color: string
  bookmarks: ParsedBookmark[]
}

function emptyState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [{ id: INBOX_GROUP_ID, name: INBOX_GROUP_NAME, color: INBOX_GROUP_COLOR, order: 0 }],
    bookmarks: [],
  }
}

function nextOrder(orders: number[]): number {
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

/**
 * 合并并入:分组按名归入(同名并组、新名建组追加在后);
 * 每条收藏经唯一 normalizeUrl 路径规范化判重(与手动添加同源),
 * 重复或无效则跳过,空标题回退主机名(与手动添加同规则)。
 */
function ingestInto(
  base: BookmarkState,
  incoming: IncomingGroup[],
): { state: BookmarkState; report: ImportReport } {
  const groups = base.groups.map((g) => ({ ...g }))
  const bookmarks = base.bookmarks.map((b) => ({ ...b }))
  const byName = new Map(groups.map((g) => [g.name, g]))
  const seen = new Set(bookmarks.map((b) => b.url))
  let added = 0
  let skipped = 0

  for (const inc of incoming) {
    let target: Group | undefined = byName.get(inc.name)
    if (!target) {
      target = {
        id: crypto.randomUUID(),
        name: inc.name,
        color: inc.color,
        order: nextOrder(groups.map((g) => g.order)),
      }
      groups.push(target)
      byName.set(target.name, target)
    }
    for (const parsedBookmark of inc.bookmarks) {
      const url = normalizeUrl(parsedBookmark.url)
      if (url === null || seen.has(url)) {
        skipped += 1
        continue
      }
      seen.add(url)
      bookmarks.push({
        id: crypto.randomUUID(),
        url,
        title: parsedBookmark.title.trim() || new URL(url).hostname,
        note: parsedBookmark.note.trim(),
        groupId: target.id,
        order: nextOrder(
          bookmarks.filter((b) => b.groupId === target!.id).map((b) => b.order),
        ),
      })
      added += 1
    }
  }

  return {
    state: { schemaVersion: SCHEMA_VERSION, groups, bookmarks },
    report: { added, skipped },
  }
}

/** 导入 Netscape 书签 HTML:始终为合并模式(文件夹建组、判重跳过)。 */
export async function importBookmarksFromHtml(
  adapter: StorageAdapter,
  html: string,
): Promise<Result<ImportReport>> {
  const parsed = parseBookmarksHtml(html)
  if (!parsed.ok) return parsed
  const base = (await adapter.load()) ?? emptyState()
  const incoming: IncomingGroup[] = parsed.value.groups.map((g) => ({
    name: g.name,
    color: IMPORTED_GROUP_COLOR,
    bookmarks: g.bookmarks,
  }))
  if (parsed.value.inbox.length > 0) {
    incoming.unshift({ name: INBOX_GROUP_NAME, color: INBOX_GROUP_COLOR, bookmarks: parsed.value.inbox })
  }
  const { state, report } = ingestInto(base, incoming)
  await adapter.save(state)
  return { ok: true, value: report }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

function isGroupShape(v: unknown): v is Group {
  if (typeof v !== 'object' || v === null) return false
  const g = v as Record<string, unknown>
  return (
    isNonEmptyString(g.id) &&
    isNonEmptyString(g.name) &&
    isNonEmptyString(g.color) &&
    typeof g.order === 'number'
  )
}

function isBookmarkShape(v: unknown): v is Bookmark {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  return (
    isNonEmptyString(b.id) &&
    isNonEmptyString(b.url) &&
    isNonEmptyString(b.title) &&
    typeof b.note === 'string' &&
    isNonEmptyString(b.groupId) &&
    typeof b.order === 'number'
  )
}

/** 逐字段校验备份 JSON 的结构;只有完全合法的完整状态才可导入。 */
function parseStateJson(raw: string): Result<BookmarkState> {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'invalid-import' }
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'invalid-import' }
  const s = data as Record<string, unknown>
  if (s.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'invalid-import' }
  if (!Array.isArray(s.groups) || !Array.isArray(s.bookmarks)) {
    return { ok: false, error: 'invalid-import' }
  }
  if (!s.groups.every(isGroupShape) || !s.bookmarks.every(isBookmarkShape)) {
    return { ok: false, error: 'invalid-import' }
  }
  return { ok: true, value: s as unknown as BookmarkState }
}

/**
 * 替换全部:清空后恢复备份(id/顺序/颜色/备注逐字保留),
 * 同时修复损坏备份:补回缺失收集箱、孤儿收藏收回收集箱、备份内重复 URL 只留首条。
 */
function restoreFrom(backup: BookmarkState): { state: BookmarkState; report: ImportReport } {
  const groups = backup.groups.map((g) => ({ ...g }))
  if (!groups.some((g) => g.id === INBOX_GROUP_ID)) {
    groups.unshift({ id: INBOX_GROUP_ID, name: INBOX_GROUP_NAME, color: INBOX_GROUP_COLOR, order: -1 })
  }
  const groupIds = new Set(groups.map((g) => g.id))
  const seen = new Set<string>()
  const bookmarks: Bookmark[] = []
  let skipped = 0
  for (const backupBookmark of backup.bookmarks) {
    const url = normalizeUrl(backupBookmark.url)
    if (url === null || seen.has(url)) {
      skipped += 1
      continue
    }
    seen.add(url)
    bookmarks.push({
      ...backupBookmark,
      url,
      groupId: groupIds.has(backupBookmark.groupId) ? backupBookmark.groupId : INBOX_GROUP_ID,
    })
  }
  return {
    state: { schemaVersion: SCHEMA_VERSION, groups, bookmarks },
    report: { added: bookmarks.length, skipped },
  }
}

/** 导入 JSON 备份:merge 同名并组+判重跳过;replace 清空后逐字恢复。 */
export async function importStateFromJson(
  adapter: StorageAdapter,
  raw: string,
  mode: ImportMode,
): Promise<Result<ImportReport>> {
  const parsed = parseStateJson(raw)
  if (!parsed.ok) return parsed

  if (mode === 'replace') {
    const { state, report } = restoreFrom(parsed.value)
    await adapter.save(state)
    return { ok: true, value: report }
  }

  const current = (await adapter.load()) ?? emptyState()
  const byGroup = new Map<string, Bookmark[]>()
  for (const bookmark of parsed.value.bookmarks) {
    const list = byGroup.get(bookmark.groupId) ?? []
    list.push(bookmark)
    byGroup.set(bookmark.groupId, list)
  }
  const incoming: IncomingGroup[] = [...parsed.value.groups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      name: g.name,
      color: g.color,
      bookmarks: (byGroup.get(g.id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((b) => ({ url: b.url, title: b.title, note: b.note })),
    }))
  const { state, report } = ingestInto(current, incoming)
  await adapter.save(state)
  return { ok: true, value: report }
}
