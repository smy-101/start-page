import { useMemo, useRef } from "react";
import { byOrder } from "../domain/types";
import type {
  Bookmark,
  BookmarkId,
  BookmarkState,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
} from "../domain/types";
import type { BookmarkPatch } from "../domain/store";
import { GroupSection } from "./GroupSection";

/** 拖拽回调束:表头拖拽换位 + 收藏卡片拖拽(组内排序/跨组移动)。 */
export type DragHandlers = {
  onGroupDragStart(groupId: GroupId): void;
  onCardDragStart(bookmarkId: BookmarkId, groupId: GroupId): void;
  onDragEnd(): void;
  /** 分区整体是放置目标:组间换位(拖组)或追加到组末尾(拖收藏)。 */
  onSectionDragOver(event: React.DragEvent): void;
  onSectionDrop(event: React.DragEvent, targetGroupId: GroupId): void;
  /** 卡片是放置目标:拖到某卡片之前(组内排序与跨组移动共用)。 */
  onCardDragOver(event: React.DragEvent): void;
  onCardDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
};

type BookmarkGroupsProps = {
  state: BookmarkState;
  /** 全部分组(按 order 排序,含收集箱;搜索过滤时也不缩水):选分组候选 */
  groups: Group[];
  /** true = 正在搜索过滤(查询非空):全部无命中时显示空状态,而非全部分组 */
  searching: boolean;
  /** 编辑模式:操作与拖拽仅在此模式出现(ui-refresh/04) */
  editMode: boolean;
  /** 以下回调均为稳定身份(分组/卡片 memo 的前提);子组件以自身数据供给 id。 */
  onRenameGroup(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolorGroup(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & DragHandlers;

function sameItems<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * 组内收藏列表:内容未变(逐项同引用)时复用上一次的数组实例,
 * 使无关变更不打破下游 GroupSection/BookmarkCard 的 memo。
 */
function useGroupedBookmarks(
  bookmarks: Bookmark[],
  groups: Group[]
): Map<GroupId, Bookmark[]> {
  const cacheRef = useRef(new Map<GroupId, Bookmark[]>());
  return useMemo(() => {
    const next = new Map<GroupId, Bookmark[]>();
    for (const group of groups) {
      const fresh = bookmarks
        .filter((bookmark) => bookmark.groupId === group.id)
        .sort(byOrder);
      const prev = cacheRef.current.get(group.id);
      next.set(group.id, prev && sameItems(prev, fresh) ? prev : fresh);
    }
    cacheRef.current = next;
    return next;
  }, [bookmarks, groups]);
}

/** 看板(ui-refresh/04):分组按 order 排列成横向列;搜索中无命中时给出中文空状态提示。 */
export function BookmarkGroups({
  state,
  groups,
  searching,
  editMode,
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
  const groupsByOrder = useMemo(
    () => [...state.groups].sort(byOrder),
    [state.groups]
  );
  const grouped = useGroupedBookmarks(state.bookmarks, groupsByOrder);

  if (searching && state.bookmarks.length === 0) {
    return <p className="search-empty">没有找到匹配的收藏</p>;
  }

  return (
    <div className="groups-wall">
      {groupsByOrder.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          bookmarks={grouped.get(group.id) ?? []}
          groups={groups}
          editMode={editMode}
          onRename={onRenameGroup}
          onRecolor={onRecolorGroup}
          onDeleteGroup={onDeleteGroup}
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
    </div>
  );
}
