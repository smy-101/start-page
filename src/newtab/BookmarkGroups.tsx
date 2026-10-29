import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { planWall, wallColumnCount } from "./wallLayout";
import type { WallPlan } from "./wallLayout";
import { useGroupedBookmarks } from "./useGroupedBookmarks";

/** 拖拽回调束:表头拖拽换位 + 收藏卡片拖拽(组内排序/跨组移动)。
 * 事件对象先行传入:App 需设置 effectAllowed/dropEffect 并读取坐标。 */
export type DragHandlers = {
  onGroupDragStart(event: React.DragEvent, groupId: GroupId): void;
  onCardDragStart(
    event: React.DragEvent,
    bookmarkId: BookmarkId,
    groupId: GroupId
  ): void;
  onDragEnd(): void;
  /** 分区整体是放置目标:组间换位(拖组)或追加到组末尾(拖收藏)。 */
  onSectionDragOver(event: React.DragEvent, targetGroupId: GroupId): void;
  onSectionDrop(event: React.DragEvent, targetGroupId: GroupId): void;
  /** 卡片是放置目标:按指针上/下半判定插到目标之前/之后。 */
  onCardDragOver(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  onCardDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  /** 指针整墙拖离:清除插入指示线。 */
  onWallDragLeave(event: React.DragEvent): void;
};

/** 拖收藏时的插入指示:组内渲染坐标的插入槽位(0=最前)。 */
export type DropHint = { groupId: GroupId; index: number } | null;

/** 看板视图 props(App 注入缝 boardView 的基底;白板在其上扩 onSetGroupPositions)。 */
export type BookmarkGroupsProps = {
  state: BookmarkState;
  /** 全部分组(按 order 排序,含收集箱;搜索过滤时也不缩水):选分组候选 */
  groups: Group[];
  /** true = 正在搜索过滤(查询非空):全部无命中时显示空状态,而非全部分组;
   * 搜索时忽略折叠(找内容不藏命中项) */
  searching: boolean;
  /** 被折叠的分组 id 集;搜索时全部临时展开 */
  collapsedIds: ReadonlySet<GroupId>;
  /** 编辑模式:操作与拖拽仅在此模式出现(ui-refresh/04) */
  editMode: boolean;
  /** 拖收藏中的插入指示线(App 依指针位置维护);null = 无拖拽/不在本组 */
  dropHint: DropHint;
  /** 折叠/展开分组(稳定身份;子组件以自身 group 数据供给 id) */
  onToggleCollapse(groupId: GroupId): void;
  /** 以下回调均为稳定身份(分组/卡片 memo 的前提);子组件以自身数据供给 id。 */
  onRenameGroup(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolorGroup(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & DragHandlers;

/** 看板墙常量:与原 grid `minmax(300px, 1fr)` / gap 一致。 */
const WALL_MIN_COLUMN = 300;
const WALL_GAP = 16;

type WallLayout = {
  wallRef: React.RefObject<HTMLDivElement | null>;
  /** 分组卡元素登记(按 id 缓存的稳定回调,memo 前提):测量与观察都靠它。 */
  itemRef(id: GroupId): (el: HTMLElement | null) => void;
  plan: WallPlan;
};

/**
 * 瀑布流墙(ADR-0003):分组卡高度不一,grid 行对齐会留出行间空隙;
 * 这里测高后贪心装箱到最矮列。DOM 顺序保持逻辑顺序(可访问性、
 * 组间拖拽语义不变),位置由 planWall 计算。
 *
 * 测量两条腿:挂载/集合变化时 useLayoutEffect 同步量(首帧不闪);
 * ResizeObserver 跟踪后续高度变化(收藏增删/折叠/编辑态)。
 * jsdom 无 ResizeObserver、量出恒 0 → 退化为均匀铺开,不影响行为测试。
 */
function useWallLayout(ids: GroupId[]): WallLayout {
  const wallRef = useRef<HTMLDivElement | null>(null);
  const itemEls = useRef(new Map<GroupId, HTMLElement>());
  const [wallWidth, setWallWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});

  const registerItem = useCallback((id: GroupId, el: HTMLElement | null) => {
    if (el) itemEls.current.set(id, el);
    else itemEls.current.delete(id);
  }, []);

  // 回调按 id 缓存:渲染间身份稳定,不打断 GroupSection 的 memo
  const refCache = useRef(new Map<GroupId, (el: HTMLElement | null) => void>());
  const itemRef = useCallback(
    (id: GroupId) => {
      let fn = refCache.current.get(id);
      if (!fn) {
        fn = (el) => registerItem(id, el);
        refCache.current.set(id, fn);
      }
      return fn;
    },
    [registerItem]
  );

  // 同步测量:首帧(绘画前)即得到真实高度;jsdom 里恒 0,同样无害
  useLayoutEffect(() => {
    const wall = wallRef.current;
    if (!wall) return;
    setWallWidth((prev) =>
      prev === wall.clientWidth ? prev : wall.clientWidth
    );
    setHeights((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const el = itemEls.current.get(id);
        const height = el ? Math.round(el.offsetHeight) : 0;
        if (prev[id] !== height) {
          next[id] = height;
          changed = true;
        }
      }
      for (const key of Object.keys(next)) {
        if (!ids.includes(key as GroupId)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [ids]);

  // 后续变化:墙宽(窗口缩放)与各卡高度(增删收藏/折叠/编辑)都由 RO 跟踪
  useEffect(() => {
    const wall = wallRef.current;
    if (!wall || typeof ResizeObserver === "undefined") return;
    const elToId = new Map<HTMLElement, GroupId>();
    for (const id of ids) {
      const el = itemEls.current.get(id);
      if (el) elToId.set(el, id);
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === wall) {
          const width = wall.clientWidth;
          setWallWidth((prev) => (Math.abs(prev - width) < 1 ? prev : width));
          continue;
        }
        const id = elToId.get(entry.target as HTMLElement);
        if (!id) continue;
        const height = Math.round((entry.target as HTMLElement).offsetHeight);
        setHeights((prev) =>
          prev[id] === height ? prev : { ...prev, [id]: height }
        );
      }
    });
    observer.observe(wall);
    for (const [el] of elToId) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  const plan = useMemo(() => {
    const columns = wallColumnCount(wallWidth, WALL_MIN_COLUMN, WALL_GAP);
    return planWall(
      ids.map((id) => heights[id] ?? 0),
      columns,
      wallWidth,
      WALL_GAP
    );
  }, [ids, heights, wallWidth]);

  return { wallRef, itemRef, plan };
}

/** 看板(ui-refresh/04 → 瀑布流 ADR-0003):分组按 order 逐个装箱到最矮列;
 * 搜索中无命中时给出中文空状态提示。 */
export function BookmarkGroups({
  state,
  groups,
  searching,
  collapsedIds,
  editMode,
  dropHint,
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
  onWallDragLeave,
  onEdit,
  onDelete,
}: BookmarkGroupsProps) {
  const groupsByOrder = useMemo(
    () => [...state.groups].sort(byOrder),
    [state.groups]
  );
  const grouped = useGroupedBookmarks(state.bookmarks, groupsByOrder);
  const wallIds = useMemo(
    () => groupsByOrder.map((g) => g.id),
    [groupsByOrder]
  );
  const wall = useWallLayout(wallIds);

  if (searching && state.bookmarks.length === 0) {
    return <p className="search-empty">没有找到匹配的收藏</p>;
  }

  return (
    <div
      className="groups-wall"
      ref={wall.wallRef}
      style={{ height: wall.plan.height }}
      onDragLeave={onWallDragLeave}
    >
      {groupsByOrder.map((group, i) => (
        <GroupSection
          key={group.id}
          group={group}
          bookmarks={grouped.get(group.id) ?? []}
          groups={groups}
          placement={wall.plan.placements[i]}
          // 搜索时忽略折叠:找内容不藏命中项(board-refresh/03)
          collapsed={!searching && collapsedIds.has(group.id)}
          editMode={editMode}
          dropIndex={dropHint?.groupId === group.id ? dropHint.index : null}
          onToggleCollapse={onToggleCollapse}
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
          elementRef={wall.itemRef(group.id)}
        />
      ))}
    </div>
  );
}
