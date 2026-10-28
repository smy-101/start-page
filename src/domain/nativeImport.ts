import type { ImportReport, ParsedBookmarks, ParsedBookmark } from './importExport'
import { ingestParsedBookmarks } from './importExport'
import type { Result, StorageAdapter } from './types'

/**
 * chrome.bookmarks.BookmarkTreeNode 的结构子集(领域层零 chrome.* 依赖,spec 决策);
 * 真实节点可结构性直接喂入。url 有值视为书签,否则视为文件夹。
 */
export interface NativeBookmarkNode {
  id?: string
  title: string
  url?: string
  children?: NativeBookmarkNode[]
}

/**
 * 原生书签树 → 待导入形态(与 HTML 导入同构,复用同一并组/判重管线):
 * - 每个含直接书签的文件夹 → 同名分组(父组先于子组,确定性遍历顺序)
 * - Chrome 固定根(书签栏/其他书签/移动设备书签)不特殊处理:
 *   有直接书签即为普通顶层分组,无直接书签即跳过——空的「其他书签」「移动设备书签」
 *   不产生空分组;不读 folderType(Chrome 134+ 才有,按空跳过已足够确定性)
 * - 根下散项(不属于任何文件夹)→ 收集箱;空标题文件夹回退「未命名分组」
 * URL 判重不在解析层:交给并组管线经唯一 normalizeUrl 路径跳过。
 */
export function parseNativeBookmarkTree(nodes: NativeBookmarkNode[]): Result<ParsedBookmarks> {
  const parsed: ParsedBookmarks = { inbox: [], groups: [] }

  function walkFolder(folder: NativeBookmarkNode): void {
    const direct: ParsedBookmark[] = []
    const subfolders: NativeBookmarkNode[] = []
    for (const child of folder.children ?? []) {
      if (child.url) direct.push({ url: child.url, title: child.title, note: '' })
      else subfolders.push(child)
    }
    if (direct.length > 0) {
      parsed.groups.push({ name: folder.title.trim() || '未命名分组', bookmarks: direct })
    }
    for (const sub of subfolders) walkFolder(sub)
  }

  for (const node of nodes) {
    if (node.url) {
      parsed.inbox.push({ url: node.url, title: node.title, note: '' })
      continue
    }
    for (const child of node.children ?? []) {
      if (child.url) parsed.inbox.push({ url: child.url, title: child.title, note: '' })
      else walkFolder(child)
    }
  }

  if (parsed.groups.length === 0 && parsed.inbox.length === 0) {
    return { ok: false, error: 'invalid-import' }
  }
  return { ok: true, value: parsed }
}

/** 从浏览器原生书签一次性导入:解析纯函数 + 并组管线(判重跳过、统计报告)。 */
export async function importNativeBookmarks(
  adapter: StorageAdapter,
  nodes: NativeBookmarkNode[],
): Promise<Result<ImportReport>> {
  const parsed = parseNativeBookmarkTree(nodes)
  if (!parsed.ok) return parsed
  return ingestParsedBookmarks(adapter, parsed.value)
}
