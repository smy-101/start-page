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
import type { BookmarkPatch, GroupPositionInput } from "../domain/store";
import { CANVAS_W, appendPositions, packCanvas } from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import { GroupSection } from "./GroupSection";
import type { DropHint, DragHandlers } from "./dragTypes";
import { useGroupedBookmarks } from "./useGroupedBookmarks";

/** 松手吸附网格(px,ADR-0004 Q4)。 */
const SNAP = 16;
/** 拖动意图阈值(px,board-whiteboard/03):位移超过即视为想拖分组,日常态出 nudge。 */
const INTENT_PX = 5;
/** nudge 自动消隐时长(ms,board-whiteboard/03)。 */
const NUDGE_MS = 4000;
/** 画布底衬:内容底边之外再留的呼吸位。 */
const CANVAS_PAD = 24;

/**
 * 白板(ADR-0004,board-whiteboard/02):分组卡在固定 1200px 画布上
 * x/y 自由定位(坐标即布局,入库 schema v3),窗口更窄横向滚动不重排。
 *
 * - 组位移走 Pointer 事件:画布级委托 pointerdown(交互控件放行),
 *   move/up 挂 window;拖中关位移过渡跟手 1:1,松手吸附 16px 网格
 *   后经 onSetGroupPositions 写回(clamp 由领域层收口)。
 * - 画布捕获阶段拦非收藏卡的原生 dragstart(组头文字选区等,免劫持
 *   pointermove);组内收藏排序仍走 HTML5 DnD(DropHint 体系),收藏卡
 * (.card)的 dragstart 放行。
 * - 「自动整理」:量高贪心装箱回 packCanvas 落点;测不出高度(零高,
 *   jsdom)退化零高铺开——与 v2→v3 迁移共用 spreadPositions。
 * - 本票门禁(board-whiteboard/03):白板模式(原编辑模式)是唯一拖拽入口。
 *   日常态不进拖拽会话,按住分组卡移动超 5px 出 nudge 引导
 *   (一键进入,4s 自动消隐);搜索过滤态禁拖也不出 nudge
 *   (过滤态坐标无意义),「自动整理」同因禁用。
 * - 墙退役后(board-whiteboard/04)是 App 的唯一看板视图。
 */
/** 白板 props(渲染测试的 harness 供外部注入用)。 */
export type WhiteboardProps = {
  state: BookmarkState;
  /** 全部分组(按 order 排序,含收集箱;搜索过滤时也不缩水):选分组候选 */
  groups: Group[];
  /** true = 正在搜索过滤(查询非空):全部无命中时显示空状态 */
  searching: boolean;
  /** 被折叠的分组 id 集;搜索时全部临时展开 */
  collapsedIds: ReadonlySet<GroupId>;
  /** 白板模式(原编辑模式,board-whiteboard/03):唯一开拖拽与编辑控件的门禁 */
  whiteboardMode: boolean;
  /** nudge 一键进入白板模式(稳定身份;App 供给) */
  onEnterWhiteboard(): void;
  /** 拖收藏中的插入指示线(组内排序 DropHint 体系照常工作) */
  dropHint: DropHint;
  /** 折叠/展开分组(稳定身份) */
  onToggleCollapse(groupId: GroupId): void;
  /** 共享回调(稳定身份):分组操作 */
  onRenameGroup(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolorGroup(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  /** 白板落点批量写回:拖拽松手(单条)与自动整理(整批) */
  onSetGroupPositions(
    positions: GroupPositionInput[]
  ): Promise<Result<Group[]>>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
} & DragHandlers;

/** Pointer 拖拽会话的被拖卡跟手坐标(未吸附;松手才吸附写回)。 */
type DragPos = { id: GroupId; x: number; y: number };

export function Whiteboard({
  state,
  groups,
  searching,
  collapsedIds,
  whiteboardMode,
  onEnterWhiteboard,
  dropHint,
  onToggleCollapse,
  onRenameGroup,
  onRecolorGroup,
  onDeleteGroup,
  onSetGroupPositions,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
  onBoardDragLeave,
  onEdit,
  onDelete,
}: WhiteboardProps) {
  const groupsByOrder = useMemo(
    () => [...state.groups].sort(byOrder),
    [state.groups]
  );
  const ids = useMemo(() => groupsByOrder.map((g) => g.id), [groupsByOrder]);
  const grouped = useGroupedBookmarks(state.bookmarks, groupsByOrder);
  const { itemRef, idOf, heightOf, heights } = useCardRegistry(ids);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragPos | null>(null);
  // 日常态拖动意图:位移超 INTENT_PX 出 nudge(board-whiteboard/03 门禁的发现性补偿)
  const [nudge, setNudge] = useState(false);
  // 拖拽禁用态(光标/锁定标记):非白板模式或搜索过滤中
  const locked = searching || !whiteboardMode;

  // ---- 落点表:坐标来自分组数据(持久);引用稳定(memo 契约),
  // 数值未变的格子沿用旧对象,无关渲染不打断 GroupSection 的 memo。
  // 无坐标的分组(运行时损坏防御)落画布底部追加位,同新建分组口径。 ----
  const placementsRef = useRef(new Map<GroupId, CanvasPos>());
  const placements = useMemo(() => {
    const prev = placementsRef.current;
    const known = groupsByOrder.filter(
      (g) => Number.isFinite(g.x) && Number.isFinite(g.y)
    );
    const appends =
      known.length < groupsByOrder.length
        ? appendPositions(known, groupsByOrder.length - known.length)
        : [];
    let appendAt = 0;
    const next = new Map<GroupId, CanvasPos>();
    for (const g of groupsByOrder) {
      const pos: CanvasPos =
        Number.isFinite(g.x) && Number.isFinite(g.y)
          ? { x: g.x, y: g.y }
          : appends[appendAt++];
      const kept = prev.get(g.id);
      next.set(g.id, kept && kept.x === pos.x && kept.y === pos.y ? kept : pos);
    }
    placementsRef.current = next;
    return next;
  }, [groupsByOrder]);

  /** 渲染落点:被拖卡用跟手坐标(每帧新对象;其余引用稳定)。 */
  function placementOf(group: Group): CanvasPos | null {
    return drag?.id === group.id
      ? { x: drag.x, y: drag.y }
      : (placements.get(group.id) ?? null);
  }

  // 画布高随内容增长:最底卡片底边 + 底衬(测不出高度时退化为坐标底)
  let canvasMinH = CANVAS_PAD;
  for (const g of groupsByOrder) {
    const top = drag?.id === g.id ? drag.y : placements.get(g.id)?.y;
    if (top !== undefined)
      canvasMinH = Math.max(
        canvasMinH,
        top + (heights[g.id] ?? 0) + CANVAS_PAD
      );
  }

  // ---- Pointer 拖拽 ----
  // 抓取偏移与会话坐标存 ref(会话坐标的 state 只为驱动重渲染);
  // 监听器挂 window、只读 ref,不随渲染重订阅。
  // intentRef 是日常态的拖动意图起点(board-whiteboard/03):不 preventDefault、
  // 不进拖拽会话,位移超阈即出 nudge 后即弃。
  const grabRef = useRef<{
    id: GroupId;
    grabX: number;
    grabY: number;
  } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const intentRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    // 交互控件不抢:链接/按钮/表单照常点击,不给拖拽
    if (target.closest("a,button,input,textarea,select,[contenteditable]"))
      return;
    const section = target.closest<HTMLElement>(".group");
    if (!section || !canvasRef.current?.contains(section)) return;
    const id = idOf(section);
    const pos = id ? placements.get(id) : undefined;
    if (!id || !pos) return;
    // 门禁(board-whiteboard/03):白板模式是唯一拖拽入口。日常态只记拖动意图
    // 起点(搜索时连意图也不记:过滤态坐标无意义),不拦默认行为。
    if (!whiteboardMode) {
      intentRef.current = searching
        ? null
        : { x: event.clientX, y: event.clientY };
      return;
    }
    if (searching) return;
    event.preventDefault();
    const rect = section.getBoundingClientRect();
    grabRef.current = {
      id,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
    };
    dragPosRef.current = { x: pos.x, y: pos.y };
    setDrag({ id, x: pos.x, y: pos.y });
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const grab = grabRef.current;
      const canvas = canvasRef.current;
      if (grab && canvas) {
        const rect = canvas.getBoundingClientRect();
        // 拖中只压非负(右界由松手吸附后的领域钳回收口)
        const x = Math.max(0, event.clientX - rect.left - grab.grabX);
        const y = Math.max(0, event.clientY - rect.top - grab.grabY);
        dragPosRef.current = { x, y };
        setDrag((prev) => (prev ? { ...prev, x, y } : prev));
        return;
      }
      // 日常态拖动意图(board-whiteboard/03):位移超阈即出 nudge,一次性
      const origin = intentRef.current;
      if (origin) {
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        if (dx * dx + dy * dy > INTENT_PX * INTENT_PX) {
          intentRef.current = null;
          setNudge(true);
        }
      }
    };
    const finish = () => {
      const grab = grabRef.current;
      const pos = dragPosRef.current;
      grabRef.current = null;
      dragPosRef.current = null;
      intentRef.current = null;
      setDrag(null);
      if (!grab || !pos) return;
      // 松手吸附:16px 网格取整;越右界的钳回交给 store(clampToCanvas)
      const x = Math.round(pos.x / SNAP) * SNAP;
      const y = Math.round(pos.y / SNAP) * SNAP;
      void onSetGroupPositions([{ id: grab.id, x, y }]);
    };
    // 指针被系统取消(切窗/触控打断):只清会话,不落吸附坐标
    const cancel = () => {
      grabRef.current = null;
      dragPosRef.current = null;
      intentRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onSetGroupPositions]);

  // nudge 生命周期(board-whiteboard/03):出笼 4s 自动消隐;进白板模式或进搜索
  // 即撤(前者使命完成,后者场景失效——过滤态不出引导)
  useEffect(() => {
    if (!nudge) return;
    const timer = window.setTimeout(() => setNudge(false), NUDGE_MS);
    return () => window.clearTimeout(timer);
  }, [nudge]);

  useEffect(() => {
    if (whiteboardMode || searching) setNudge(false);
  }, [whiteboardMode, searching]);

  // ---- 自动整理:量高 → packCanvas 贪心装箱回坐标(零高退化已内聚
  // 在领域模块,与 v2→v3 迁移共用 spreadPositions 策略)。 ----
  const pack = useCallback(() => {
    if (ids.length === 0) return;
    const positions = packCanvas(ids.map((id) => heightOf(id)));
    void onSetGroupPositions(
      ids.map((id, i) => ({ id, x: positions[i].x, y: positions[i].y }))
    );
  }, [ids, heightOf, onSetGroupPositions]);

  // 组头等非收藏卡的原生 dragstart 被画布拦下(捕获阶段,避免文字选区
  // 拖拽劫持 pointermove 会话);收藏卡(.card,含浏览态链接拖曳)照常
  // 放行,组内排序 DnD 不受影响
  const onCanvasDragStart = (event: React.DragEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".card")) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  if (searching && state.bookmarks.length === 0) {
    return <p className="search-empty">没有找到匹配的收藏</p>;
  }

  return (
    <div className="whiteboard">
      {nudge && (
        <p className="whiteboard-nudge" role="status">
          布局已锁定,进入白板模式后才能拖动分组
          <button
            type="button"
            className="whiteboard-nudge-enter"
            onClick={() => {
              setNudge(false);
              onEnterWhiteboard();
            }}
          >
            进入白板
          </button>
        </p>
      )}
      {whiteboardMode && (
        <div className="whiteboard-toolbar">
          <span className="whiteboard-hint">
            {searching
              ? "搜索过滤中,拖拽与整理暂不可用"
              : `拖动分组卡任意摆放 · 松手吸附 ${SNAP}px 网格`}
          </span>
          <button
            type="button"
            className="whiteboard-pack"
            onClick={pack}
            disabled={searching}
          >
            自动整理
          </button>
        </div>
      )}
      <div className="whiteboard-scroll" onDragLeave={onBoardDragLeave}>
        <div
          className="whiteboard-canvas"
          ref={canvasRef}
          data-wb-dragging={drag ? "true" : undefined}
          data-locked={locked ? "true" : undefined}
          style={{ width: CANVAS_W, minHeight: canvasMinH }}
          onPointerDown={onPointerDown}
          onDragStartCapture={onCanvasDragStart}
        >
          {groupsByOrder.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              bookmarks={grouped.get(group.id) ?? []}
              groups={groups}
              placement={placementOf(group)}
              collapsed={!searching && collapsedIds.has(group.id)}
              whiteboardMode={whiteboardMode}
              dragActive={drag?.id === group.id}
              dropIndex={dropHint?.groupId === group.id ? dropHint.index : null}
              onToggleCollapse={onToggleCollapse}
              onRename={onRenameGroup}
              onRecolor={onRecolorGroup}
              onDeleteGroup={onDeleteGroup}
              onCardDragStart={onCardDragStart}
              onDragEnd={onDragEnd}
              onSectionDragOver={onSectionDragOver}
              onSectionDrop={onSectionDrop}
              onCardDragOver={onCardDragOver}
              onCardDrop={onCardDrop}
              onEdit={onEdit}
              onDelete={onDelete}
              elementRef={itemRef(group.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 分组卡登记与量高(白板版):itemRef 正向登记(按 id 缓存的稳定回调,
 * memo 前提)、拖拽委托反查 id;量高两条腿——挂载/集合变化时
 * useLayoutEffect 同步量(首帧不闪),ResizeObserver 跟踪后续变化
 * (收藏增删/折叠/编辑态)。高度进 state(渲染用)而非只存 ref:
 * 画布高随测随长,StrictMode 双调用下时序确定(原型 ref 版翻车教训)。
 * jsdom 无 RO、量出恒 0 → 画布高退化、自动整理走零高铺开,行为不受影响。
 */
function useCardRegistry(ids: readonly GroupId[]) {
  const idToEl = useRef(new Map<GroupId, HTMLElement>());
  const elToId = useRef(new Map<HTMLElement, GroupId>());
  const [heights, setHeights] = useState<Record<string, number>>({});

  const register = useCallback((id: GroupId, el: HTMLElement | null) => {
    const forward = idToEl.current;
    const reverse = elToId.current;
    const old = forward.get(id);
    if (old) reverse.delete(old);
    if (el) {
      forward.set(id, el);
      reverse.set(el, id);
    } else {
      forward.delete(id);
    }
  }, []);

  // 回调按 id 缓存:渲染间身份稳定,不打断 GroupSection 的 memo
  const refCache = useRef(new Map<GroupId, (el: HTMLElement | null) => void>());
  const itemRef = useCallback(
    (id: GroupId) => {
      let fn = refCache.current.get(id);
      if (!fn) {
        fn = (el) => register(id, el);
        refCache.current.set(id, fn);
      }
      return fn;
    },
    [register]
  );

  // 同步测量:首帧(绘画前)即得到真实高度;jsdom 里恒 0,同样无害
  useLayoutEffect(() => {
    setHeights((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const el = idToEl.current.get(id);
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

  // 后续高度变化(增删收藏/折叠/编辑表单)由 RO 跟踪
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setHeights((prev) => {
        let next = prev;
        for (const entry of entries) {
          const id = elToId.current.get(entry.target as HTMLElement);
          if (!id) continue;
          const height = Math.round((entry.target as HTMLElement).offsetHeight);
          if (next[id] !== height) next = { ...next, [id]: height };
        }
        return next;
      });
    });
    for (const el of idToEl.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [ids]);

  const idOf = useCallback(
    (el: HTMLElement): GroupId | undefined => elToId.current.get(el),
    []
  );

  /** 即时量高(自动整理用):读 DOM 当前值,不吃 state 的旧账。 */
  const heightOf = useCallback(
    (id: GroupId): number =>
      Math.round(idToEl.current.get(id)?.offsetHeight ?? 0),
    []
  );

  return { itemRef, idOf, heightOf, heights };
}
