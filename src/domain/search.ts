import type { BookmarkState } from './types'

/** 单条收藏是否命中查询(标题/URL/备注不区分大小写的子串匹配)。 */
function matches(query: string, bookmark: { title: string; url: string; note: string }): boolean {
  return (
    bookmark.title.toLowerCase().includes(query) ||
    bookmark.url.toLowerCase().includes(query) ||
    bookmark.note.toLowerCase().includes(query)
  )
}

/**
 * 搜索过滤(纯函数,不修改传入状态):
 * 标题/URL/备注不区分大小写的子串匹配;查询为空时原样返回,初始页据此恢复完整分组视图。
 */
export function filterState(state: BookmarkState, query: string): BookmarkState {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return state
  const bookmarks = state.bookmarks.filter((bookmark) => matches(normalized, bookmark))
  const matchedGroupIds = new Set(bookmarks.map((b) => b.groupId))
  return {
    ...state,
    groups: state.groups.filter((g) => matchedGroupIds.has(g.id)),
    bookmarks,
  }
}
