import type { Bookmark, GroupId } from '../domain/types'
import type { Result } from '../domain/types'
import type { BookmarkStore } from '../domain/store'
import { normalizeUrl } from '../domain/url'

/**
 * 右键菜单点击语义:菜单接线层(contextMenus.ts)只翻译事件,
 * 收藏/移动/取消的业务决定全部在这里,纯逻辑、零 chrome 依赖,可单测。
 */

/** 按规范化 URL 查收藏:右键判定“已收藏?”与各点击语义共用。 */
export function findBookmarkByUrl(store: BookmarkStore, rawUrl: string): Bookmark | null {
  const normalized = normalizeUrl(rawUrl)
  if (normalized === null) return null
  return store.getState().bookmarks.find((b) => b.url === normalized) ?? null
}

/** 右键「收藏到:某组」:未收藏 → 收藏到该组;已收藏 → 移动到该组(同组无操作)。 */
export async function favoriteToGroup(
  store: BookmarkStore,
  rawUrl: string,
  title: string | undefined,
  groupId: GroupId,
): Promise<Result<Bookmark>> {
  const normalized = normalizeUrl(rawUrl)
  if (normalized === null) return { ok: false, error: 'invalid-url' }
  const existing = findBookmarkByUrl(store, rawUrl)
  if (existing) return store.moveBookmark(existing.id, groupId)
  return store.addBookmark({ url: rawUrl, title, groupId })
}

/** 右键「取消收藏」:未收藏/非可收藏 URL → 无动作,返回 null。 */
export async function unfavoriteByUrl(store: BookmarkStore, rawUrl: string): Promise<Bookmark | null> {
  const existing = findBookmarkByUrl(store, rawUrl)
  if (!existing) return null
  const removed = await store.removeBookmark(existing.id)
  return removed.ok ? existing : null
}
