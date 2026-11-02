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
import {
  groupCellsForWidth,
  groupCellsOf,
  groupWidthPxOf,
  GROUP_W_MIN,
  CELL_W,
  GROUP_H_MAX,
  GROUP_H_MIN,
} from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import { useAxisResize } from "./useAxisResize";
import type { DragHandlers } from "./useCardDnD";

type GroupSectionProps = {
  group: Group;
  bookmarks: Bookmark[];
  /** 全部分组(按 order 排序):行编辑换组的选择候选 */
  groups: Group[];
  /** 画布坐标(ADR-0004):x/y 入库,组宽为自由宽 px(schema v13,
   * group-width-free,缺省从每行条数推导);null 时不定位 */
  placement: CanvasPos | null;
  /** 折叠态(board-refresh/03):仅渲染列头,不挂载组内 DOM */
  collapsed: boolean;
  /** 白板模式(原编辑模式,board-whiteboard/03):唯一开编辑控件与拖拽的门禁 */
  whiteboardMode: boolean;
  /** 白板 Pointer 拖拽中且本卡是被拖卡(whiteboard):拖中关位移过渡、提升浮起 */
  dragActive?: boolean;
  /** 组右缘调宽拖柄可见(group-width-tint):白板模式且非搜索、非折叠 */
  resizable: boolean;
  /** 调宽上界(px,随画布宽):Whiteboard 供给画布宽(组宽无处超过画布) */
  resizeMaxW: number;
  /** 拖收藏中的插入槽位(本组渲染坐标);null = 指针不在本组 */
  dropIndex: number | null;
  /** 画布测量登记(Whiteboard 供给,按 id 缓存的稳定回调) */
  elementRef?: RefCallback<HTMLElement>;
  /** 折叠/展开(稳定身份):本组件以自身 group 数据供给 id */
  onToggleCollapse(groupId: GroupId): void;
  /** 共享回调(稳定身份):本组件以自身 group/bookmark 数据供给 id。 */
  onRename(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolor(id: GroupId, color: string): Promise<Result<Group>>;
  /** 组宽写回(拖柄松手/键盘步进;group-width-free;store 界限钳回收口) */
  onResizeWidth(id: GroupId, width: number): Promise<Result<Group>>;
  /** 每行条数写回(组头表单;组宽只升不降) */
  onSetColumns(id: GroupId, columns: number): Promise<Result<Group>>;
  /** 组定长高写回(group-height;底柄松手/键盘步进/钉住切换;store 界限
   * 钳回收口;undefined = 解除定长回自适应) */
  onResizeHeight(
    id: GroupId,
    height: number | undefined
  ): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
  /** 收藏排序拖拽回调束(整束直透 BookmarkCard;memo 比较 6 函数引用 → 1 对象引用,
   * 未消费成员惰性无害) */
  handlers: DragHandlers;
};

/**
 * 画布上的分组卡(ui-refresh/04 → ADR-0004 白板):x/y 坐标自由定位,
 * 组宽为自由宽 px(schema v13,group-width-free;缺省从每行条数推导
 * 装满;拖柄调宽、表单调每行条数且不缩宽)。折叠时仅列头
 * (board-refresh/03),收集箱是保留分组,列头只读。memo:props 未变时
 * 跳过重渲染(工单 10a)。
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
  resizeMaxW,
  dragActive,
  dropIndex,
  elementRef,
  onToggleCollapse,
  onRename,
  onRecolor,
  onResizeWidth,
  onSetColumns,
  onResizeHeight,
  onDeleteGroup,
  handlers,
  onEdit,
  onDelete,
}: GroupSectionProps) {
  // ---- 组右缘调宽(group-width-free 自由宽,schema v13):与待办卡调宽
  // (todo-card-size-color)逐字同语言——松手 16px 网格吸附、键盘 ←/→
  // 步进一格;宽上界随画布宽收窄(Whiteboard 供给 resizeMaxW)。
  // preview/committed 双态 + 回流哨兵 + 指针/键盘接线收敛进 useAxisResize
  // (todo-review-followups/01),此处只供配置。
  const minW = GROUP_W_MIN;
  const maxW = Math.max(minW, resizeMaxW);

  const resize = useAxisResize<{
    atWidth: number | undefined;
    atColumns: number | undefined;
  }>({
    axis: "x",
    min: minW,
    max: maxW,
    base: () => groupWidthPxOf(group),
    snap: snapGrid,
    step: stepGrid,
    commit: (w) => void onResizeWidth(group.id, w),
    snapshot: () => ({ atWidth: group.width, atColumns: group.columns }),
    // 持久生效宽追上已提交即清;store 钳回不同值(窄画布收窄)或宽/
    // 每行条数被外部改动(表单/缩画布)时快照偏离,同样解除本地宽
    settled: (committedW, pending) =>
      groupWidthPxOf(group) === committedW ||
      (pending !== null &&
        (group.width !== pending.atWidth ||
          group.columns !== pending.atColumns)),
    watch: group,
  });
  const width = resize.preview ?? resize.committed ?? groupWidthPxOf(group);

  // ---- 组底缘定长调高(group-height):与待办卡调高(todo-height-archive)
  // 逐字同语言——松手 16px 网格吸附、键盘 ↑/↓ 步进;高不随画布宽收窄。
  // 自适应组的调高基数 = 实测高(事件时即时量高,读 DOM 同步口径)
  const minH = GROUP_H_MIN;
  const maxH = GROUP_H_MAX;

  /** 16px 网格吸附(同待办卡/画布宽/组调宽口径;吸附取最近格点合法)。 */
  function snapGrid(v: number): number {
    return Math.round(v / 16) * 16;
  }

  /** 键盘一步:从当前值的上/下一格网格起(store 收口重复钳)。 */
  function stepGrid(current: number, dir: 1 | -1): number {
    return dir > 0
      ? (Math.floor(current / 16) + 1) * 16
      : (Math.ceil(current / 16) - 1) * 16;
  }

  /** 自适应组的调高基数:实测高(事件时即时量高;jsdom/未挂载 0 → 下界兜底)。 */
  function measuredBaseOf(el: EventTarget | null): number {
    const section = (el as HTMLElement | null)?.closest("section.group");
    const h = section?.getBoundingClientRect().height ?? 0;
    return Math.max(minH, Math.floor(h));
  }

  const resizeH = useAxisResize<{ atHeight: number | undefined }>({
    axis: "y",
    min: minH,
    max: maxH,
    base: (target) => group.height ?? measuredBaseOf(target),
    snap: snapGrid,
    step: stepGrid,
    commit: (height) => void onResizeHeight(group.id, height),
    snapshot: () => ({ atHeight: group.height }),
    settled: (committedH, pending) =>
      group.height === committedH ||
      (pending !== null && group.height !== pending.atHeight),
    watch: group,
  });
  // 生效定长高:预览 > 已提交 > 持久;undefined = 自适应(不定位高);
  // 折叠时定长失效(只渲染组头,不占空高)
  const fixedH = resizeH.preview ?? resizeH.committed ?? group.height;
  const effectiveFixedH = collapsed ? undefined : fixedH;

  /** 钉住/解除定长(group-height):白板模式组头切换两种高度模式;
   * 钉住 = 以实测高吸附 16px 网格落定长,解除 = undefined 回自适应。
   * 计算归本组件(复用 measuredBaseOf/snapGrid,免 header 重抄一份),
   * GroupHeader 只接事件 */
  function handlePinToggle(event: React.MouseEvent) {
    if (group.height !== undefined) {
      void onResizeHeight(group.id, undefined);
      return;
    }
    const pinned = Math.min(
      Math.max(snapGrid(measuredBaseOf(event.currentTarget)), minH),
      maxH
    );
    void onResizeHeight(group.id, pinned);
  }
  // 组内网格模板:每行条数生效值(缺省 = 装满随宽);与 CSS minmax 同口径,
  // 条数 < 装满时条目拉满整行(清单式)
  const gridTemplate = {
    gridTemplateColumns: `repeat(${groupCellsOf(group)}, minmax(${CELL_W}px, 1fr))`,
  };

  const canvasStyle = placement
    ? {
        left: placement.x,
        top: placement.y,
        width,
        ...(effectiveFixedH !== undefined ? { height: effectiveFixedH } : null),
      }
    : undefined;

  return (
    <section
      className="group"
      aria-label={group.name}
      data-collapsed={collapsed ? "true" : undefined}
      data-drag-active={dragActive ? "true" : undefined}
      data-drop-hint={dropIndex !== null ? "true" : undefined}
      data-resizing={
        resize.preview !== null || resizeH.preview !== null ? "true" : undefined
      }
      data-fixed-height={effectiveFixedH !== undefined ? "true" : undefined}
      ref={elementRef}
      // 分组色注入为 CSS 变量:托盘淡染/悬停边框/指示线等着色用(纯表现,不影响语义)
      style={{ "--group-color": group.color, ...canvasStyle } as CSSProperties}
      onDragOver={(event) => handlers.onSectionDragOver(event, group.id)}
      onDrop={(event) => handlers.onSectionDrop(event, group.id)}
    >
      <GroupHeader
        group={group}
        bookmarkCount={bookmarks.length}
        collapsed={collapsed}
        whiteboardMode={whiteboardMode}
        onToggleCollapse={() => onToggleCollapse(group.id)}
        onRename={(name) => onRename(group.id, name)}
        onRecolor={(color) => onRecolor(group.id, color)}
        onSetColumns={(columns) => onSetColumns(group.id, columns)}
        onPinToggle={handlePinToggle}
        onDeleteGroup={() => onDeleteGroup(group.id)}
      />
      {!collapsed &&
        (bookmarks.length === 0 ? (
          dropIndex !== null ? (
            <ul className="group-grid" style={gridTemplate}>
              <li className="drop-indicator" aria-hidden="true" />
            </ul>
          ) : (
            <p className="group-empty">还没有收藏</p>
          )
        ) : (
          <ul className="group-grid" style={gridTemplate}>
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
                  handlers={handlers}
                />
              </Fragment>
            ))}
            {dropIndex === bookmarks.length && (
              <li className="drop-indicator" aria-hidden="true" />
            )}
          </ul>
        ))}
      {/* 组右缘调宽拖柄(group-width-free 自由宽):白板模式且非搜索、非折叠;
          键盘可达(separator 角色),←/→ 步进一格 16px 网格;调宽中回显
          连续宽,清单式(条数 < 装满)附每行条数 */}
      {resizable && (
        <div
          className="group-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={`调整分组 ${group.name} 宽度`}
          aria-valuenow={Math.round(width)}
          aria-valuemin={minW}
          aria-valuemax={maxW}
          aria-valuetext={`${Math.round(width)} px`}
          title="拖动调整组宽"
          tabIndex={0}
          {...resize.handleProps}
        >
          {resize.preview !== null && (
            <span className="group-resize-badge" role="status">
              {(() => {
                // 每行条数随预览同口径:缺省 = 装满(随宽),显式值钳
                // 不越预览装满(同 store setGroupWidth 的自动降)
                const fit = groupCellsForWidth(resize.preview);
                const cells =
                  group.columns === undefined
                    ? fit
                    : Math.min(group.columns, fit);
                // 装满只报宽;清单式(条数 < 装满)附每行条数
                return cells < fit
                  ? `${Math.round(resize.preview)} px · 一行 ${cells} 条`
                  : `${Math.round(resize.preview)} px`;
              })()}
            </span>
          )}
        </div>
      )}
      {/* 组底缘定长调高拖柄(group-height):门禁同宽柄(白板模式且非搜索、
          非折叠);键盘 ↑/↓ 步进一格 16px 网格;调高中回显连续高;
          自适应组读数报「自适应」(valuenow 为下界兜底基数) */}
      {resizable && (
        <div
          className="group-resize-b"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`调整分组 ${group.name} 高度`}
          aria-valuenow={Math.round(fixedH ?? minH)}
          aria-valuemin={minH}
          aria-valuemax={maxH}
          aria-valuetext={
            fixedH !== undefined ? `${Math.round(fixedH)} px` : "自适应"
          }
          title="拖动调整高度"
          tabIndex={0}
          {...resizeH.handleProps}
        >
          {resizeH.preview !== null && (
            <span className="group-resize-badge" role="status">
              {Math.round(resizeH.preview)} px
            </span>
          )}
        </div>
      )}
    </section>
  );
});
