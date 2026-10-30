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
import {
  MAX_CANVAS_W,
  MIN_CANVAS_W,
  appendPositions,
  canvasBoundWidth,
  clampCanvasWidth,
  effectiveCanvasWidth,
  groupSpanOf,
  groupWidthOf,
  maxSpanForCanvas,
  packCanvas,
  snapAlignment,
} from "../domain/canvas";
import type { AlignGuide, CanvasPos, Rect } from "../domain/canvas";
import { GroupSection } from "./GroupSection";
import type { DropHint, DragHandlers } from "./useCardDnD";
import { useGroupedBookmarks } from "./useGroupedBookmarks";

/** 松手吸附网格(px,ADR-0004 Q4)。 */
const SNAP = 16;
/** 拖动意图阈值(px,board-whiteboard/03):位移超过即视为想拖分组,日常态出 nudge。 */
const INTENT_PX = 5;
/** nudge 自动消隐时长(ms,board-whiteboard/03)。 */
const NUDGE_MS = 4000;
/** 画布底衬:内容底边之外再留的呼吸位。 */
const CANVAS_PAD = 24;
/** 拖拽中贴近滚动壳内缘的自动滚动区宽(px,canvas-bounds-align)。 */
const AUTOSCROLL_ZONE = 36;
/** 自动滚动单帧最大步长(px)。 */
const AUTOSCROLL_STEP = 12;

/**
 * 白板(ADR-0004,board-whiteboard/02):分组卡在画布上 x/y 自由定位
 * (坐标即布局,入库 schema v3),窗口更窄横向滚动不重排;
 * 画布宽可调、入库(schema v4,canvas-bounds-align):白板模式画布描边
 * + 点阵底纹可见,右缘拖柄调宽(松手 16px 吸附、钳回 [720, 2400])。
 * 缺省为自动档(schema v5,canvas-bounds-align/04):画布撑满可用宽
 * (实测滚动壳内容宽),拖柄调宽后钉住为固定宽。
 *
 * - 组位移走 Pointer 事件:画布级委托 pointerdown(交互控件放行),
 *   move/up 挂 window;拖中关位移过渡跟手 1:1,且**实时钳在画布内**
 *   (x ≤ 画布宽 − 卡宽;不再先逃逸后弹回,边缘可见后钳回可预期);
 *   对齐吸附(canvas-bounds-align):拖中与其余卡/画布边线的 左/中/右、
 *   上/中/下 边线比对,阈值 8px 内吸到精确对齐并显示辅助线
 *   (`.wb-guide-x/y`),已对齐轴松手跳过网格吸附(对象吸附优先)。
 * - 画布宽于视口时,拖分组/调宽中指针贴近滚动壳左右内缘自动滚动
 *   (rAF 循环),否则右缘在宽画布上永远够不着。
 * - 画布捕获阶段拦非收藏卡的原生 dragstart(组头文字选区等,免劫持
 *   pointermove);组内收藏排序仍走 HTML5 DnD(DropHint 体系),收藏卡
 * (.card)的 dragstart 放行。
 * - 「自动整理」:量高贪心装箱回 packCanvas 落点(列数随画布宽自适应);
 *   测不出高度(零高,jsdom)退化零高铺开——与 v2→v3 迁移共用 spreadPositions。
 * - 本票门禁(board-whiteboard/03):白板模式(原编辑模式)是唯一拖拽入口。
 *   日常态不进拖拽会话,按住分组卡移动超 5px 出 nudge 引导
 *   (一键进入,4s 自动消隐);搜索过滤态禁拖也不出 nudge
 *   (过滤态坐标无意义),「自动整理」「调宽」同因禁用。
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
  /** 画布宽写回(右缘拖柄松手/键盘调整;钳回与重钳越界分组在 store 收口) */
  onResizeCanvas(width: number): Promise<Result<number>>;
  /** 组宽档位写回(group-span-decouple):组右缘拖柄/键盘 → store 钳回落盘 */
  onResizeGroup(id: GroupId, span: number): Promise<Result<Group>>;
  /** 每行条数写回(group-span-decouple):组头表单 → store 只升不降落盘 */
  onSetGroupColumns(id: GroupId, columns: number): Promise<Result<Group>>;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
  /** 收藏排序拖拽回调束(useCardDnD 出口,引用稳定):整束直透 GroupSection,
   * 本组件只自用 onBoardDragLeave(滚动壳拖离清指示线) */
  handlers: DragHandlers;
};

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
  onResizeCanvas,
  onResizeGroup,
  onSetGroupColumns,
  handlers,
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragPos | null>(null);
  // 拖拽对齐辅助线(canvas-bounds-align):拖中存在,松手/取消即清
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  // 调宽预览(右缘拖柄拖中):null = 非调宽中;数值为预览宽(连续,松手才吸附)
  const [resizePreview, setResizePreview] = useState<number | null>(null);
  // 松手后的本地已提交宽:等持久状态回流再清,免松手闪回旧宽一帧
  const [canvasOverride, setCanvasOverride] = useState<number | null>(null);
  // 预览宽 ref 镜像:松手收口在稳定订阅的监听器里,不吃渲染期旧账
  const resizePreviewRef = useRef<number | null>(null);
  // 日常态拖动意图:位移超 INTENT_PX 出 nudge(board-whiteboard/03 门禁的发现性补偿)
  const [nudge, setNudge] = useState(false);
  // 拖拽禁用态(光标/锁定标记):非白板模式或搜索过滤中
  const locked = searching || !whiteboardMode;

  // 画布自动档(schema v5):实测滚动壳内容宽(画布的可用宽),RO 跟踪
  // 窗口变化;无 RO(jsdom)退 resize 监听。搜索空态提前返回不挂滚动壳,
  // 依赖随搜索/收藏数变化重跑补测。
  const [shellW, setShellW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setShellW(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [searching, state.bookmarks.length]);

  // 画布宽(自动档见 effectiveCanvasWidth):调宽中用预览宽,松手后未回流前
  // 用已提交宽——两级本地宽都不吃存储往返延迟;未钉宽时撑满可用宽
  const canvasW =
    resizePreview ??
    canvasOverride ??
    effectiveCanvasWidth(state.canvasWidth, shellW);
  // 渲染期 ref 镜像:window 监听器(稳定订阅)读最新值
  const canvasWRef = useRef(canvasW);
  canvasWRef.current = canvasW;
  const heightsRef = useRef(heights);
  heightsRef.current = heights;

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

  // 各组渲染宽(group-span-decouple):档位推导,拖拽钳界/对齐/哨兵共用;
  // 调宽拖柄在组内本地预览,提交后经持久档位回流到本表
  const widthOf = useCallback(
    (id: GroupId): number =>
      groupWidthOf(groupSpanOf(groupsByOrder.find((g) => g.id === id) ?? {})),
    [groupsByOrder]
  );
  const widthOfRef = useRef(widthOf);
  widthOfRef.current = widthOf;

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

  // ---- Pointer 拖拽 / 右缘调宽(canvas-bounds-align)----
  // 抓取偏移与会话坐标存 ref(会话坐标的 state 只为驱动重渲染);
  // 监听器挂 window、只随稳定回调重订阅,几何经渲染期 ref 镜像取最新。
  // intentRef 是日常态的拖动意图起点(board-whiteboard/03):不 preventDefault、
  // 不进拖拽会话,位移超阈即出 nudge 后即弃。
  const grabRef = useRef<{
    id: GroupId;
    grabX: number;
    grabY: number;
  } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  // 松手跳网格的轴记账:对齐吸附活跃的轴写精确对齐坐标(对象吸附优先)
  const alignedRef = useRef<{ x: boolean; y: boolean }>({ x: false, y: false });
  // 拖拽松手后的落位回流哨兵:持久坐标到位即清拖拽态(免松手闪回旧位)
  const dropPendingRef = useRef<DragPos | null>(null);
  const intentRef = useRef<{ x: number; y: number } | null>(null);
  // 调宽会话:标记活跃即可(预览宽实时算,松手吸附写回)
  const resizingRef = useRef(false);
  // 最新指针位置(window 坐标):自动滚动后重算跟手坐标用
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  /** 拖拽一步:钳画布界 → 对齐吸附 → 跟手坐标 + 辅助线。 */
  function applyDrag(clientX: number, clientY: number): void {
    const grab = grabRef.current;
    const canvas = canvasRef.current;
    if (!grab || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = canvasWRef.current;
    // 拖中钳在画布内(右界 = 宽 − 各组宽,group-width-tint;画布向下无界只压非负)——
    // 不再先逃逸后弹回,边缘可见后钳回可预期
    const dragW = widthOfRef.current(grab.id);
    const x = Math.min(
      Math.max(0, clientX - rect.left - grab.grabX),
      width - dragW
    );
    const y = Math.max(0, clientY - rect.top - grab.grabY);
    // 对齐吸附:与其余卡(持久落点 + 已测高)和画布边线比对
    const others: Rect[] = [];
    for (const [id, pos] of placementsRef.current) {
      if (id === grab.id) continue;
      others.push({
        x: pos.x,
        y: pos.y,
        w: widthOfRef.current(id),
        h: heightsRef.current[id] ?? 0,
      });
    }
    const snap = snapAlignment(
      { x, y, w: dragW, h: heightsRef.current[grab.id] ?? 0 },
      others,
      width
    );
    const pos = { x: snap.x ?? x, y: snap.y ?? y };
    alignedRef.current = { x: snap.x !== null, y: snap.y !== null };
    dragPosRef.current = pos;
    setDrag((prev) => (prev ? { ...prev, ...pos } : prev));
    setGuides(snap.guides);
  }

  /** 调宽一步:预览宽连续跟手,钳回界限(吸附留到松手)。 */
  function applyResize(clientX: number): void {
    const canvas = canvasRef.current;
    if (!canvas || !resizingRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const preview = clampCanvasWidth(clientX - rect.left);
    resizePreviewRef.current = preview;
    setResizePreview(preview);
  }

  // 指针被系统取消(切窗/触控打断):只清会话,不落吸附坐标/预览宽,
  // 取消即回持久坐标与宽(与松手的「等回流」不同:没有提交,无须哨兵)
  function cancelSession(): void {
    stopAutoScroll();
    grabRef.current = null;
    dragPosRef.current = null;
    intentRef.current = null;
    resizingRef.current = false;
    pointerRef.current = null;
    resizePreviewRef.current = null;
    dropPendingRef.current = null;
    setDrag(null);
    setGuides([]);
    setResizePreview(null);
    setCanvasOverride(null);
  }

  // ---- 自动滚动(canvas-bounds-align):会话活跃期间 rAF 循环,
  // 指针贴近滚动壳左右内缘即按超出量比例滚动;滚动改变了画布视口,
  // 跟手坐标/预览宽用最新指针重算(指针不动画布在动,卡也要跟)。 ----
  const rafRef = useRef(0);
  function stopAutoScroll(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }
  function startAutoScroll(): void {
    stopAutoScroll();
    const step = () => {
      const scroller = scrollRef.current;
      const pointer = pointerRef.current;
      if (scroller && pointer && scroller.clientWidth > 0) {
        const rect = scroller.getBoundingClientRect();
        const before = scroller.scrollLeft;
        const overRight = pointer.x - (rect.right - AUTOSCROLL_ZONE);
        const overLeft = rect.left + AUTOSCROLL_ZONE - pointer.x;
        if (overRight > 0) {
          scroller.scrollLeft = Math.min(
            before + Math.min(AUTOSCROLL_STEP, 2 + overRight * 0.25),
            scroller.scrollWidth
          );
        } else if (overLeft > 0) {
          scroller.scrollLeft = Math.max(
            before - Math.min(AUTOSCROLL_STEP, 2 + overLeft * 0.25),
            0
          );
        }
        if (scroller.scrollLeft !== before && grabRef.current) {
          applyDrag(pointer.x, pointer.y);
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

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
    dropPendingRef.current = null;
    grabRef.current = {
      id,
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
    };
    alignedRef.current = { x: false, y: false };
    dragPosRef.current = { x: pos.x, y: pos.y };
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setDrag({ id, x: pos.x, y: pos.y });
    startAutoScroll();
  };

  // 右缘拖柄:整高热区,pointerdown 起调宽会话(键盘走 onKeyDown);
  // 不起自动滚动——视口内拖柄跟手即可,超视口宽度用键盘步进
  // (自动滚动会因 rect 左移把预览宽滚飞,实测教训)
  const onResizePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 || locked) return;
    event.preventDefault();
    event.stopPropagation();
    resizingRef.current = true;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    resizePreviewRef.current = canvasWRef.current;
    setResizePreview(canvasWRef.current);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (grabRef.current) {
        applyDrag(event.clientX, event.clientY);
        return;
      }
      if (resizingRef.current) {
        applyResize(event.clientX);
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
      const resizing = resizingRef.current;
      const preview = resizePreviewRef.current;
      // 会话引用先行清场;拖拽位与调宽宽的显示留到持久回流再清(免闪回旧值)
      stopAutoScroll();
      grabRef.current = null;
      dragPosRef.current = null;
      intentRef.current = null;
      resizingRef.current = false;
      pointerRef.current = null;
      resizePreviewRef.current = null;
      setGuides([]);
      setResizePreview(null);
      if (grab && pos) {
        // 松手吸附:对齐活跃轴写精确对齐坐标(floor 收整 px),
        // 其余轴 16px 网格取整;越右界的钳回交给 store(clampToCanvas)。
        // 松手后卡停在吸附位等持久坐标回流(拖拽态保留到那一刻)
        const x = alignedRef.current.x
          ? Math.floor(pos.x)
          : Math.round(pos.x / SNAP) * SNAP;
        const y = alignedRef.current.y
          ? Math.floor(pos.y)
          : Math.round(pos.y / SNAP) * SNAP;
        dropPendingRef.current = { id: grab.id, x, y };
        setDrag({ id: grab.id, x, y });
        void onSetGroupPositions([{ id: grab.id, x, y }]);
        return;
      }
      if (resizing) {
        // 调宽:.松手 16px 网格吸附(界限钳回收口在 store);
        // 已提交宽留到持久回流再清,预览宽立即退场
        const width = Math.round((preview ?? canvasWRef.current) / SNAP) * SNAP;
        setCanvasOverride(width);
        void onResizeCanvas(width);
        return;
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelSession);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelSession);
      stopAutoScroll();
    };
  }, [onSetGroupPositions, onResizeCanvas]);

  // 卸载清 rAF(会话监听器由上方 effect 的清理承担)
  useEffect(() => stopAutoScroll, []);

  // 松手后的回流哨兵:拖拽态/已提交宽保留到持久状态追上本地值再清
  // (存储往返 1–2 帧里卡与画布停在提交位,不闪回旧值)。
  // 坐标「追上」容忍右界钳回的等价值(store 唯一的坐标变换)。
  useEffect(() => {
    const pending = dropPendingRef.current;
    if (pending) {
      const pos = placements.get(pending.id);
      // 右界哨兵与 store 同口径:固定宽按固定值,自动档按上限;
      // 右界随各组宽(group-width-tint)
      const bound = canvasBoundWidth(state) - widthOfRef.current(pending.id);
      const settled =
        pos &&
        pos.y === pending.y &&
        (pos.x === pending.x || (pending.x >= bound && pos.x === bound));
      if (settled) {
        dropPendingRef.current = null;
        setDrag(null);
      }
      return;
    }
    // 已提交宽留到持久回流再清(逐字比较;自动档钉宽后即携带数值)
    if (canvasOverride !== null && state.canvasWidth === canvasOverride) {
      setCanvasOverride(null);
    }
  }, [placements, canvasOverride, state]);

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
  // 在领域模块,与 v2→v3 迁移共用 spreadPositions 策略;列数随画布宽自适应)。 ----
  const pack = useCallback(() => {
    if (ids.length === 0) return;
    const positions = packCanvas(
      ids.map((id) => heightOf(id)),
      canvasWRef.current,
      // 宽度感知装箱(group-width-tint):各组按各自渲染宽占槽
      ids.map((id) => widthOfRef.current(id))
    );
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

  // 调宽键盘支持:←/→ 按 16px 网格步进(钳回界限在 store 收口)
  const onResizeKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? SNAP : -SNAP;
    void onResizeCanvas(canvasWRef.current + step);
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
              : `拖动分组卡任意摆放 · 对齐自动吸附 · 画布自动撑满,拖右缘固定宽(${MIN_CANVAS_W}–${MAX_CANVAS_W}px)`}
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
      <div
        className="whiteboard-scroll"
        ref={scrollRef}
        onDragLeave={handlers.onBoardDragLeave}
      >
        <div
          className="whiteboard-canvas"
          ref={canvasRef}
          data-wb-dragging={drag ? "true" : undefined}
          data-wb-resizing={resizePreview !== null ? "true" : undefined}
          data-locked={locked ? "true" : undefined}
          style={{ width: canvasW, minHeight: canvasMinH }}
          onPointerDown={onPointerDown}
          onDragStartCapture={onCanvasDragStart}
        >
          {groupsByOrder.map((group) => {
            const collapsed = !searching && collapsedIds.has(group.id);
            return (
              <GroupSection
                key={group.id}
                group={group}
                bookmarks={grouped.get(group.id) ?? []}
                groups={groups}
                placement={placementOf(group)}
                collapsed={collapsed}
                whiteboardMode={whiteboardMode}
                resizable={!locked && !collapsed}
                resizeMaxSpan={maxSpanForCanvas(canvasW)}
                dragActive={drag?.id === group.id}
                dropIndex={
                  dropHint?.groupId === group.id ? dropHint.index : null
                }
                onToggleCollapse={onToggleCollapse}
                onRename={onRenameGroup}
                onRecolor={onRecolorGroup}
                onResizeSpan={onResizeGroup}
                onSetColumns={onSetGroupColumns}
                onDeleteGroup={onDeleteGroup}
                handlers={handlers}
                onEdit={onEdit}
                onDelete={onDelete}
                elementRef={itemRef(group.id)}
              />
            );
          })}
          {/* 对齐辅助线(canvas-bounds-align):拖中才有;画布线贯穿整幅 */}
          {guides.map((guide, i) =>
            guide.axis === "x" ? (
              <div
                key={`x${i}`}
                className="wb-guide wb-guide-x"
                aria-hidden="true"
                style={
                  guide.canvas
                    ? { left: guide.at, top: 0, bottom: 0 }
                    : {
                        left: guide.at,
                        top: guide.from,
                        height: guide.to - guide.from,
                      }
                }
              />
            ) : (
              <div
                key={`y${i}`}
                className="wb-guide wb-guide-y"
                aria-hidden="true"
                style={
                  guide.canvas
                    ? { top: guide.at, left: 0, right: 0 }
                    : {
                        top: guide.at,
                        left: guide.from,
                        width: guide.to - guide.from,
                      }
                }
              />
            )
          )}
          {/* 右缘调宽拖柄:白板模式且非搜索;调宽中显示宽度读数 */}
          {!locked && (
            <div
              className="wb-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整画布宽度"
              aria-valuenow={Math.round(canvasW)}
              aria-valuemin={MIN_CANVAS_W}
              aria-valuemax={MAX_CANVAS_W}
              tabIndex={0}
              onPointerDown={onResizePointerDown}
              onKeyDown={onResizeKeyDown}
            >
              {resizePreview !== null && (
                <span className="wb-resize-badge" role="status">
                  {Math.round(resizePreview)} px
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 分组卡登记与量高(白板版):itemRef 正向登记(按 id 缓存的稳定回调,
 * memo 前提)、拖拽委托反查 id;量高三条腿——每次提交后
 * useLayoutEffect 同步量(首帧不闪,且提交改高当帧回流画布高:
 * 折叠/展开、组宽档位、收藏增删不闪旧高露出画布边界;
 * RO 的 setState 在绘制后才提交,赶不上这一帧)、ResizeObserver 跟踪
 * 非提交引起的变化(字体加载等)、即时量高(自动整理)直读 DOM。
 * 高度进 state(渲染用)而非只存 ref:
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

  // 同步测量:首帧(绘画前)即得到真实高度;且每次提交后都量——折叠/展开、
  // 组宽档位、收藏增删等凡改组高的提交,画布高在同一帧内回流(RO 的
  // setState 在绘制后才提交,底缘组折叠会闪一帧旧高露出画布边界);
  // 未变则返回旧引用,不触发多余渲染。jsdom 里恒 0,同样无害
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
  });

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
