import type { Bookmark, GroupId, Result } from '../domain/types'
import type { BookmarkStore } from '../domain/store'

/**
 * 右键菜单点击语义:菜单接线层(contextMenus.ts)只翻译事件,
 * 收藏/移动/取消的业务决定全部在这里,纯逻辑、零 chrome 依赖,可单测。
 * URL 规范化与按 URL 查收藏统一委托 store(唯一 normalizeUrl 判重路径)。
 */

/** 右键「收藏到:某组」:未收藏 → 收藏到该组;已收藏 → 移动到该组(同组无操作)。 */
export async function favoriteToGroup(
  store: BookmarkStore,
  rawUrl: string,
  title: string | undefined,
  groupId: GroupId,
): Promise<Result<Bookmark>> {
  const existing = store.findBookmarkByUrl(rawUrl)
  if (existing) return store.moveBookmark(existing.id, groupId)
  // 不可收藏 URL 由 addBookmark 经同一规范化路径拒为 invalid-url
  return store.addBookmark({ url: rawUrl, title, groupId })
}

/** 右键「取消收藏」:未收藏/非可收藏 URL → 无动作,返回 null。 */
export async function unfavoriteByUrl(store: BookmarkStore, rawUrl: string): Promise<Bookmark | null> {
  const existing = store.findBookmarkByUrl(rawUrl)
  if (!existing) return null
  const removed = await store.removeBookmark(existing.id)
  return removed.ok ? existing : null
}
