import type { NativeBookmarkNode } from '../domain/nativeImport'

/**
 * chrome.bookmarks 薄封装(spec Testing Decisions:适配器不单测,靠 dist 冒烟覆盖)。
 * 真实 BookmarkTreeNode 与领域层 NativeBookmarkNode 结构兼容,直接喂入纯函数。
 */
export function getNativeBookmarkTree(): Promise<NativeBookmarkNode[]> {
  return chrome.bookmarks.getTree()
}
