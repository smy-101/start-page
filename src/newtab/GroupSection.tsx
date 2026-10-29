import { Fragment, memo } from "react";
import type { CSSProperties, RefCallback } from "react";
import type {
  Bookmark,
  BookmarkId,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
} from "../domain/types";
import type { BookmarkPatch } from "../domain/store";
import { BookmarkCard } from "./BookmarkCard";
import { GroupHeader } from "./GroupHeader";
import { CARD_W } from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import type { DragHandlers } from "./dragTypes";

type GroupSectionProps = {
  group: Group;
  bookmarks: Bookmark[];
  /** 全部分组(按 order 排序):行编辑换组的选择候选 */
  groups: Group[];
  /** 画布坐标(ADR-0004):x/y 入库,卡宽全局常量;null 时不定位 */
  placement: CanvasPos | null;
  /** 折叠态(board-refresh/03):仅渲染列头,不挂载组内 DOM */
  collapsed: boolean;
  /** 白板模式(原编辑模式,board-whiteboard/03):唯一开编辑控件与拖拽的门禁 */
  whiteboardMode: boolean;
  /** 白板 Pointer 拖拽中且本卡是被拖卡(whiteboard):拖中关位移过渡、提升浮起 */
  dragActive?: boolean;
  /** 拖收藏中的插入槽位(本组渲染坐标);null = 指针不在本组 */
  dropIndex: number | null;
  /** 画布测量登记(Whiteboard 供给,按 id 缓存的稳定回调) */
  elementRef?: RefCallback<HTMLElement>;
  /** 折叠/展开(稳定身份):本组件以自身 group 数据供给 id */
  onToggleCollapse(groupId: GroupId): void;
  /** 共享回调(稳定身份):本组件以自身 group/bookmark 数据供给 id。 */
  onRename(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolor(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & Omit<DragHandlers, "onBoardDragLeave">;

/**
 * 画布上的分组卡(ui-refresh/04 → ADR-0004 白板):x/y 坐标自由定位,
 * 卡宽全局常量。折叠时仅列头(board-refresh/03),收集箱是保留分组,
 * 列头只读。memo:props 未变时跳过重渲染(工单 10a)。
 * DOM 顺序仍保持组间逻辑 order 序(可访问性)。
 */
export const GroupSection = memo(function GroupSection({
  group,
  bookmarks,
  groups,
  placement,
  collapsed,
  whiteboardMode,
  dragActive,
  dropIndex,
  elementRef,
  onToggleCollapse,
  onRename,
  onRecolor,
  onDeleteGroup,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
  onEdit,
  onDelete,
}: GroupSectionProps) {
  const canvasStyle = placement
    ? { left: placement.x, top: placement.y, width: CARD_W }
    : undefined;

  return (
    <section
      className="group"
      aria-label={group.name}
      data-collapsed={collapsed ? "true" : undefined}
      data-drag-active={dragActive ? "true" : undefined}
      data-drop-hint={dropIndex !== null ? "true" : undefined}
      ref={elementRef}
      // 分组色注入为 CSS 变量:左脊/悬停边框/指示线等着色用(纯表现,不影响语义)
      style={{ "--group-color": group.color, ...canvasStyle } as CSSProperties}
      onDragOver={(event) => onSectionDragOver(event, group.id)}
      onDrop={(event) => onSectionDrop(event, group.id)}
    >
      <GroupHeader
        group={group}
        bookmarkCount={bookmarks.length}
        collapsed={collapsed}
        whiteboardMode={whiteboardMode}
        onToggleCollapse={() => onToggleCollapse(group.id)}
        onRename={(name) => onRename(group.id, name)}
        onRecolor={(color) => onRecolor(group.id, color)}
        onDeleteGroup={() => onDeleteGroup(group.id)}
      />
      {!collapsed &&
        (bookmarks.length === 0 ? (
          dropIndex !== null ? (
            <ul className="group-grid">
              <li className="drop-indicator" aria-hidden="true" />
            </ul>
          ) : (
            <p className="group-empty">还没有收藏</p>
          )
        ) : (
          <ul className="group-grid">
            {bookmarks.map((bookmark, index) => (
              <Fragment key={bookmark.id}>
                {dropIndex === index && (
                  <li className="drop-indicator" aria-hidden="true" />
                )}
                <BookmarkCard
                  bookmark={bookmark}
                  group={group}
                  groups={groups}
                  whiteboardMode={whiteboardMode}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDragStart={onCardDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onCardDragOver}
                  onDrop={onCardDrop}
                />
              </Fragment>
            ))}
            {dropIndex === bookmarks.length && (
              <li className="drop-indicator" aria-hidden="true" />
            )}
          </ul>
        ))}
    </section>
  );
});
