import type { Bookmark, Group, Result } from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import { BookmarkCard } from './BookmarkCard'
import { GroupHeader } from './GroupHeader'

type DeleteGroupResult = Result<{ groupId: string; recycledIds: string[] }>

type GroupSectionProps = {
  group: Group
  bookmarks: Bookmark[]
  collapsed: boolean
  onToggleCollapse(): void
  onRename(name: string): Promise<Result<Group>>
  onRecolor(color: string): Promise<Result<Group>>
  onDeleteGroup(): Promise<DeleteGroupResult>
  onEdit: (id: string, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: string) => Promise<Result<string>>
  /** 拖拽三件套:表头拖拽换位 + 收藏卡片拖拽(组内排序/跨组移动)。 */
  onGroupDragStart(groupId: string): void
  onCardDragStart(bookmarkId: string, groupId: string): void
  onDragEnd(): void
  /** 分区整体是放置目标:组间换位(拖组)或追加到组末尾(拖收藏)。 */
  onSectionDragOver(event: React.DragEvent): void
  onSectionDrop(event: React.DragEvent, targetGroupId: string): void
  /** 卡片是放置目标:拖到某卡片之前(组内排序/跨组移动共用)。 */
  onCardDragOver(event: React.DragEvent): void
  onCardDrop(event: React.DragEvent, targetBookmarkId: string): void
}

/** 分组分区:收藏网格的容器。收集箱是保留分组,表头只读;支持折叠与拖放。 */
export function GroupSection({
  group,
  bookmarks,
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
