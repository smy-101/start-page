import { Fragment, memo, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefCallback } from "react";
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
import { groupWidthOf, nearestGroupColumns } from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import type { DragHandlers } from "./dragTypes";

type GroupSectionProps = {
  group: Group;
  bookmarks: Bookmark[];
  /** 全部分组(按 order 排序):行编辑换组的选择候选 */
  groups: Group[];
  /** 画布坐标(ADR-0004):x/y 入库,组宽随每行条数推导(schema v6);
   * null 时不定位 */
  placement: CanvasPos | null;
  /** 折叠态(board-refresh/03):仅渲染列头,不挂载组内 DOM */
  collapsed: boolean;
  /** 白板模式(原编辑模式,board-whiteboard/03):唯一开编辑控件与拖拽的门禁 */
  whiteboardMode: boolean;
  /** 白板 Pointer 拖拽中且本卡是被拖卡(whiteboard):拖中关位移过渡、提升浮起 */
  dragActive?: boolean;
  /** 组右缘调宽拖柄可见(group-width-tint):白板模式且非搜索、非折叠 */
  resizable: boolean;
  /** 调宽钳上界(列):画布内放得下的最大每行条数(Whiteboard 供给) */
  resizeMaxColumns: number;
  /** 拖收藏中的插入槽位(本组渲染坐标);null = 指针不在本组 */
  dropIndex: number | null;
  /** 画布测量登记(Whiteboard 供给,按 id 缓存的稳定回调) */
  elementRef?: RefCallback<HTMLElement>;
  /** 折叠/展开(稳定身份):本组件以自身 group 数据供给 id */
  onToggleCollapse(groupId: GroupId): void;
  /** 共享回调(稳定身份):本组件以自身 group/bookmark 数据供给 id。 */
  onRename(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolor(id: GroupId, color: string): Promise<Result<Group>>;
  /** 每行条数写回(拖柄松手/键盘步进;group-width-tint) */
  onResizeColumns(id: GroupId, columns: number): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & Omit<DragHandlers, "onBoardDragLeave">;

/**
 * 画布上的分组卡(ui-refresh/04 → ADR-0004 白板):x/y 坐标自由定位,
 * 组宽随每行条数推导(schema v6,group-width-tint;拖柄调宽、松手吸附
 * 列边界)。折叠时仅列头(board-refresh/03),收集箱是保留分组,
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
  resizable,
  resizeMaxColumns,
  dragActive,
  dropIndex,
  elementRef,
  onToggleCollapse,
  onRename,
  onRecolor,
  onResizeColumns,
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
  // ---- 组右缘调宽(group-width-tint):拖中连续预览宽;松手吸附列边界后
  // 已提交宽留到持久 columns 回流再清(同画布 canvasOverride 口径,免闪回)。
  // delta 制(起点宽 + 指针位移),不依赖 rect——jsdom 里几何全 0 亦可测。
  const [previewW, setPreviewW] = useState<number | null>(null);
  const [committedW, setCommittedW] = useState<number | null>(null);
  const sessionRef = useRef<{ startX: number; startW: number } | null>(null);
  // 提交时的请求列数与当时的持久列数:哨兵辨别「回流到位」与
  // 「store 钳回了不同值」(如窄画布降列)两幂数据(均应解除本地宽)
  const pendingRef = useRef<{
    requested: number;
    atColumns: number | undefined;
  } | null>(null);

  const width = previewW ?? committedW ?? groupWidthOf(group.columns);
  const minW = groupWidthOf(1);
  const maxW = groupWidthOf(resizeMaxColumns);

  // 回流哨兵:持久 columns 的推导宽追上已提交宽即清(存储往返 1–2 帧
  // 不闪回旧宽);store 钳回不同值(窄画布降列)或列数被外部改动
  // (表单/缩画布)时持久 columns 偏离提交时快照,同样解除本地宽
  useEffect(() => {
    if (committedW === null) {
      pendingRef.current = null;
      return;
    }
    const pending = pendingRef.current;
    const settled =
      groupWidthOf(group.columns) === committedW ||
      (pending !== null && group.columns !== pending.atColumns);
    if (settled) {
      setCommittedW(null);
      pendingRef.current = null;
    }
  }, [committedW, group.columns]);

  function applyResize(clientX: number): void {
    const session = sessionRef.current;
    if (!session) return;
    const next = session.startW + (clientX - session.startX);
    setPreviewW(Math.min(Math.max(next, minW), maxW));
  }

  function finishResize(): void {
    const session = sessionRef.current;
    const preview = previewW;
    sessionRef.current = null;
    setPreviewW(null);
    if (!session || preview === null) return;
    // 松手吸附列边界(最近 W(c)),已提交宽留到持久回流再清
    const columns = nearestGroupColumns(preview);
    pendingRef.current = { requested: columns, atColumns: group.columns };
    setCommittedW(groupWidthOf(columns));
    void onResizeColumns(group.id, columns);
  }

  function cancelResize(): void {
    sessionRef.current = null;
    setPreviewW(null);
  }

  useEffect(() => {
    if (sessionRef.current === null && previewW === null) return;
    const move = (event: PointerEvent) => {
      if (sessionRef.current) applyResize(event.clientX);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
    // 会话回调读的是渲染期最新闭包;挂仅发生在会话期间
  });

  const onHandlePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // 不劫持分组移动会话(画布级 pointerdown 委托)
    event.stopPropagation();
    sessionRef.current = { startX: event.clientX, startW: width };
    setPreviewW(width);
  };

  // 键盘:←/→ 步进一列(钳 1..resizeMax;store 收口重复钳)。
  // 当前值吃本地已提交宽(回流前连按可累计,同画布调宽口径)
  const onHandleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const current =
      committedW !== null ? nearestGroupColumns(committedW) : (group.columns ?? 1);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = Math.min(
      Math.max(1, current + step),
      Math.max(1, resizeMaxColumns)
    );
    if (next === current) return;
    pendingRef.current = { requested: next, atColumns: group.columns };
    setCommittedW(groupWidthOf(next));
    void onResizeColumns(group.id, next);
  };

  const canvasStyle = placement
    ? { left: placement.x, top: placement.y, width }
    : undefined;

  return (
    <section
      className="group"
      aria-label={group.name}
      data-collapsed={collapsed ? "true" : undefined}
      data-drag-active={dragActive ? "true" : undefined}
      data-drop-hint={dropIndex !== null ? "true" : undefined}
      data-resizing={previewW !== null ? "true" : undefined}
      ref={elementRef}
      // 分组色注入为 CSS 变量:托盘淡染/悬停边框/指示线等着色用(纯表现,不影响语义)
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
        onSetColumns={(columns) => onResizeColumns(group.id, columns)}
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
      {/* 组右缘调宽拖柄(group-width-tint):白板模式且非搜索、非折叠;
          键盘可达(separator 角色),←/→ 步进一列 */}
      {resizable && (
        <div
          className="group-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={`调整分组 ${group.name} 宽度`}
          aria-valuenow={group.columns ?? 1}
          aria-valuemin={1}
          aria-valuemax={resizeMaxColumns}
          title="拖动调整每行条数"
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
        >
          {previewW !== null && (
            <span className="group-resize-badge" role="status">
              一行 {nearestGroupColumns(previewW)} 条
            </span>
          )}
        </div>
      )}
    </section>
  );
});
