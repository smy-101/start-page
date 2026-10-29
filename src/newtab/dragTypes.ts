import type { BookmarkId, GroupId } from "../domain/types";

/**
 * 收藏卡片拖拽回调束(App 供给,白板/分组卡消费;ADR-0004、
 * board-whiteboard/04 墙退役后仅存组内收藏排序的 HTML5 DnD 体系——
 * 分组移动走画布 Pointer 拖拽,不在本束内)。事件对象先行传入:
 * App 需设置 effectAllowed/dropEffect 并读取坐标。
 */
export type DragHandlers = {
  onCardDragStart(
    event: React.DragEvent,
    bookmarkId: BookmarkId,
    groupId: GroupId
  ): void;
  onDragEnd(): void;
  /** 分区整体是放置目标:收藏跨组移动时悬停列头/空白 = 追加到组末尾。 */
  onSectionDragOver(event: React.DragEvent, targetGroupId: GroupId): void;
  onSectionDrop(event: React.DragEvent, targetGroupId: GroupId): void;
  /** 卡片是放置目标:按指针上/下半判定插到目标之前/之后。 */
  onCardDragOver(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  onCardDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  /** 指针拖离整块看板:清除插入指示线。 */
  onBoardDragLeave(event: React.DragEvent): void;
};

/** 拖收藏时的插入指示:组内渲染坐标的插入槽位(0=最前)。 */
export type DropHint = { groupId: GroupId; index: number } | null;
