import type {
  Bookmark,
  BookmarkId,
  DeleteGroupResult,
  Group,
  Result,
} from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import type { DragHandlers } from './BookmarkGroups'
import { BookmarkCard } from './BookmarkCard'
import { GroupHeader } from './GroupHeader'

type GroupSectionProps = {
  group: Group
  bookmarks: Bookmark[]
  /** 全部分组(按 order 排序):卡片编辑换组的选择候选 */
  groups: Group[]
  collapsed: boolean
  onToggleCollapse(): void
  onRename(name: string): Promise<Result<Group>>
  onRecolor(color: string): Promise<Result<Group>>
  onDeleteGroup(): Promise<DeleteGroupResult>
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>
} & DragHandlers

/** 分组分区:收藏网格的容器。收集箱是保留分组,表头只读;支持折叠与拖放。 */
export function GroupSection({
  group,
  bookmarks,
  groups,
  collapsed,
  onToggleCollapse,
  onRename,
  onRecolor,
  onDeleteGroup,
  onEdit,
  onDelete,
  onGroupDragStart,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
}: GroupSectionProps) {
  return (
    <section
      className="group"
      aria-label={group.name}
      onDragOver={onSectionDragOver}
      onDrop={(event) => onSectionDrop(event, group.id)}
    >
      <GroupHeader
        group={group}
        bookmarkCount={bookmarks.length}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onRename={onRename}
        onRecolor={onRecolor}
        onDeleteGroup={onDeleteGroup}
        onDragStart={() => onGroupDragStart(group.id)}
        onDragEnd={onDragEnd}
      />
      {!collapsed &&
        (bookmarks.length === 0 ? (
          <p className="group-empty">还没有收藏</p>
        ) : (
          <ul className="group-grid">
            {bookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                group={group}
                groups={groups}
                onEdit={onEdit}
                onDelete={onDelete}
                onDragStart={() => onCardDragStart(bookmark.id, group.id)}
                onDragEnd={onDragEnd}
                onDragOver={onCardDragOver}
                onDrop={(event) => onCardDrop(event, bookmark.id)}
              />
            ))}
          </ul>
        ))}
    </section>
  )
}
