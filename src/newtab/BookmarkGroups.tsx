import type { Bookmark, BookmarkState, Result } from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import { GroupSection } from './GroupSection'

type BookmarkGroupsProps = {
  state: BookmarkState
  /** true = 正在搜索过滤(查询非空):全部无命中时显示空状态,而非全部分组 */
  searching: boolean
  onEdit: (id: string, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: string) => Promise<Result<string>>
}

/** 分组视图:按分组 order 渲染各分区;搜索中无命中时给出中文空状态提示。 */
export function BookmarkGroups({ state, searching, onEdit, onDelete }: BookmarkGroupsProps) {
  if (searching && state.bookmarks.length === 0) {
    return <p className="search-empty">没有找到匹配的收藏</p>
  }
  const groupsByOrder = [...state.groups].sort((a, b) => a.order - b.order)
  return (
    <>
      {groupsByOrder.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          bookmarks={state.bookmarks
            .filter((bookmark) => bookmark.groupId === group.id)
            .sort((a, b) => a.order - b.order)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  )
}
