import { Fragment, memo, useState } from "react";
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
import type { DragHandlers } from "./BookmarkGroups";
import type { WallPlacement } from "./wallLayout";

type GroupSectionProps = {
  group: Group;
  bookmarks: Bookmark[];
  /** 全部分组(按 order 排序):行编辑换组的选择候选 */
  groups: Group[];
  /** 瀑布流落点(ADR-0003):墙测高后由 planWall 计算;null 时不定位 */
  placement: WallPlacement | null;
  /** 折叠态(board-refresh/03):仅渲染列头,不挂载组内 DOM */
  collapsed: boolean;
  /** 白板模式(原编辑模式,board-whiteboard/03):唯一开编辑控件与拖拽的门禁 */
  whiteboardMode: boolean;
  /** 白板 Pointer 拖拽中且本卡是被拖卡(whiteboard):拖中关位移过渡、提升浮起 */
  dragActive?: boolean;
  /** 拖收藏中的插入槽位(本组渲染坐标);null = 指针不在本组 */
  dropIndex: number | null;
  /** 墙布局测量登记(BookmarkGroups 供给,按 id 缓存的稳定回调) */
  elementRef?: RefCallback<HTMLElement>;
  /** 折叠/展开(稳定身份):本组件以自身 group 数据供给 id */
  onToggleCollapse(groupId: GroupId): void;
  /** 共享回调(稳定身份):本组件以自身 group/bookmark 数据供给 id。 */
  onRename(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolor(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & Omit<DragHandlers, "onWallDragLeave">;

/**
 * 看板列(ui-refresh/04):分组的瀑布流格子。折叠时仅列头(board-refresh/03),
 * 收集箱是保留分组,列头只读。memo:props 未变时跳过重渲染(工单 10a)。
 * placement 由墙布局计算(左/顶/宽),DOM 顺序仍保持组间逻辑顺序。
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
  onGroupDragStart,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
  onEdit,
  onDelete,
}: GroupSectionProps) {
  // 组拖拽源反馈:拖起时本列就地淡化(dragend 在源元素上必发,含放置成功)
  const [groupDragging, setGroupDragging] = useState(false);

  const wallStyle = placement
    ? { left: placement.left, top: placement.top, width: placement.width }
    : undefined;

  return (
    <section
      className="group"
      aria-label={group.name}
      data-collapsed={collapsed ? "true" : undefined}
      data-group-dragging={groupDragging ? "true" : undefined}
      data-drag-active={dragActive ? "true" : undefined}
      data-drop-hint={dropIndex !== null ? "true" : undefined}
      ref={elementRef}
      // 分组色注入为 CSS 变量:左脊/悬停边框/指示线等着色用(纯表现,不影响语义)
      style={{ "--group-color": group.color, ...wallStyle } as CSSProperties}
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
        onDragStart={(event) => {
          setGroupDragging(true);
          onGroupDragStart(event, group.id);
        }}
        onDragEnd={() => {
          setGroupDragging(false);
          onDragEnd();
        }}
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
