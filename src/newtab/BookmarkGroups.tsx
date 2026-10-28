import type { Bookmark, BookmarkState, Group, GroupId, Result } from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import { GroupSection } from './GroupSection'

type DeleteGroupResult = Result<{ groupId: string; recycledIds: string[] }>

type BookmarkGroupsProps = {
  state: BookmarkState
  /** 全部分组(按 order 排序,含收集箱;搜索过滤时也不缩水):选分组候选 */
  groups: Group[]
  /** true = 正在搜索过滤(查询非空):全部无命中时显示空状态,而非全部分组 */
  searching: boolean
  /** 折叠分组 id 集合(UI 状态,localStorage 侧通道) */
  collapsedGroups: Set<string>
  onToggleCollapse(groupId: string): void
  onRenameGroup(id: GroupId, name: string): Promise<Result<Group>>
  onRecolorGroup(id: GroupId, color: string): Promise<Result<Group>>
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>
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
  onEdit: (id: string, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: string) => Promise<Result<string>>
}

/** 分组视图:按分组 order 渲染各分区;搜索中无命中时给出中文空状态提示。 */
export function BookmarkGroups({
  state,
  groups,
  searching,
  collapsedGroups,
  onToggleCollapse,
  onRenameGroup,
  onRecolorGroup,
  onDeleteGroup,
  onGroupDragStart,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
  onEdit,
  onDelete,
}: BookmarkGroupsProps) {
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
          groups={groups}
          // 搜索过滤时强制展开:折叠不应藏起命中(折叠状态本身不动,清空查询即恢复)
          collapsed={searching ? false : collapsedGroups.has(group.id)}
          onToggleCollapse={() => onToggleCollapse(group.id)}
          onRename={(name) => onRenameGroup(group.id, name)}
          onRecolor={(color) => onRecolorGroup(group.id, color)}
          onDeleteGroup={() => onDeleteGroup(group.id)}
          onGroupDragStart={onGroupDragStart}
          onCardDragStart={onCardDragStart}
          onDragEnd={onDragEnd}
          onSectionDragOver={onSectionDragOver}
          onSectionDrop={onSectionDrop}
          onCardDragOver={onCardDragOver}
          onCardDrop={onCardDrop}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  )
}
