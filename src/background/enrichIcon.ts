/**
 * 收藏后异步补图标(board-refresh/05):service worker 侧的入口
 * (工具栏一键收藏 / 右键收藏)与初始页共用领域层抓取模块。
 * 权限未授予时静默跳过(SW 里无手势上下文,不主动弹授权);
 * 任何失败都不影响已完成的收藏写入。
 */
import { fetchSiteMeta } from "../domain/fetchSiteMeta";
import type { BookmarkStore } from "../domain/store";
import type { Bookmark } from "../domain/types";
import { hasHostPermission } from "../platform/iconPermission";

export async function enrichBookmarkIcon(
  store: BookmarkStore,
  bookmark: Bookmark
): Promise<void> {
  try {
    // 已有图标的收藏(换组移动等)不重抓
    if (bookmark.icon) return;
    if (!(await hasHostPermission())) return;
    const meta = await fetchSiteMeta(bookmark.url);
    if (meta.icon) await store.updateBookmark(bookmark.id, { icon: meta.icon });
  } catch {
    // 图标是增强,不是承诺:失败静默
  }
}
