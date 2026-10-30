/**
 * 画布几何(ADR-0004、GLOSSARY「画布」):分组卡的固定宽排版平面。
 * 默认宽 1200px(canvas-bounds-align 起宽度可调、入库 schema v4)、
 * 三列、间距 16;坐标为 px,存于分组。纯数学、无 DOM:测量与拖挂组件层
 * (白板模式,board-whiteboard/02)。
 */
import type { Group } from "./types";
import type { CanvasPos } from "./types";

export type { CanvasPos } from "./types";

/** 默认画布宽(px):schema v4 起每状态可调,此为缺省与迁移缺省。 */
export const DEFAULT_CANVAS_W = 1200;
/** 画布宽下限(px,16 倍数):一列也摆得开的最小可用宽。 */
export const MIN_CANVAS_W = 720;
/** 画布宽上限(px,16 倍数):再宽超出超宽屏意义,横向滚动找回。 */
export const MAX_CANVAS_W = 2400;
export const GAP = 16;
/** 卡宽 = (1200 − 2×16)/3 ≈ 389.33(原型口径);不入库,全局唯一常量,
 * 不随画布宽拉伸(可读性由卡宽定,canvas-bounds-align)。 */
export const CARD_W = (DEFAULT_CANVAS_W - GAP * 2) / 3;
/** 默认三列 = 3×卡宽 + 2×间距 = 1200 恰好铺满(宽画布列数见 columnsFor)。 */
export const CANVAS_COLUMNS = 3;
/** 引导堆叠步长(原型口径):迁移铺开的行距、连续新组的间距。 */
export const STACK_STEP = 72;
/** 无测量时的代理卡高:推算「画布底部」用。 */
const CARD_PROXY_H = 48;
/** 画布宽吸附近似误差容差:1216 / 405.33 在浮点里是 2.999…,防 floor 掉列。 */
const EPS = 1e-6;

/** 画布宽钳回:[MIN, MAX],floor 取整(取整口径见 CODING_STANDARDS);非有限值归默认。 */
export function clampCanvasWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_CANVAS_W;
  return Math.floor(Math.min(Math.max(width, MIN_CANVAS_W), MAX_CANVAS_W));
}

/** 状态画布宽归一:非法回默认(schema v5 前的旧状态与防御运行时;缺省 = 自动档,原样透传)。 */
export function canvasWidthOf(state: {
  canvasWidth?: number;
}): number | undefined {
  return state.canvasWidth === undefined
    ? undefined
    : clampCanvasWidth(state.canvasWidth);
}

/**
 * 画布宽自动档(schema v5,canvas-bounds-align/04):未钉宽(缺省)时撑满
 * 可用宽(组件实测的滚动壳内容宽),钳 [MIN, MAX];测不出(0,jsdom)退默认。
 * 固定值(拖柄钉住)原样钳回。渲染与拖拽几何的单一入口。
 */
export function effectiveCanvasWidth(
  stored: number | undefined,
  available: number
): number {
  if (stored !== undefined) return clampCanvasWidth(stored);
  return clampCanvasWidth(available > 0 ? available : DEFAULT_CANVAS_W);
}

/**
 * 领域侧钳界宽:固定宽用固定值;自动档无存储值按上限钳——实际渲染宽在
 * 组件(拖拽落点已被组件按渲染宽钳过),钉窄时 setCanvasWidth 统一重钳。
 */
export function canvasBoundWidth(state: { canvasWidth?: number }): number {
  return state.canvasWidth === undefined
    ? MAX_CANVAS_W
    : clampCanvasWidth(state.canvasWidth);
}

/** 装箱列数随画布宽自适应:floor((W + GAP) / (卡宽 + GAP)),至少一列。 */
export function columnsFor(canvasW: number): number {
  return Math.max(1, Math.floor((canvasW + GAP + EPS) / (CARD_W + GAP)));
}

/**
 * 零高装箱(未测量/测不出高度):列间轮流派位,行距 STACK_STEP。
 * 迁移(v2→v3 存量铺开)与白板「自动整理」的测不出退化共用同一份
 * 策略(board-whiteboard/02 评审遗留:两侧同形,聚拱于纯模块)。
 * 坐标向下取整:int px 约定,且不越过 clampToCanvas 右界
 * (CANVAS_W − CARD_W = 810.67…,round 会得出 811 导致往返被改写)。
 */
export function spreadPositions(
  count: number,
  canvasW = DEFAULT_CANVAS_W
): CanvasPos[] {
  const columns = columnsFor(canvasW);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.floor((i % columns) * (CARD_W + GAP)),
    y: Math.floor(i / columns) * STACK_STEP,
  }));
}

/**
 * 自动整理装箱(ADR-0004):量得各分组卡高度后,按 order 逐个放入
 * 当前最矮列(平手取靠前)贪心装箱,无行对齐空隙——原 ADR-0003
 * 瀑布流墙的布局算法降级为整理算法,墙体退役后仅存此用途。
 * DOM/Tab 序仍由 order 承担;高度全 0(测不出,jsdom)退化零高铺开。
 */
export function packCanvas(
  heights: readonly number[],
  canvasW = DEFAULT_CANVAS_W
): CanvasPos[] {
  if (heights.length === 0) return [];
  if (heights.every((h) => h === 0))
    return spreadPositions(heights.length, canvasW);
  const columns = columnsFor(canvasW);
  const columnHeights = new Array<number>(columns).fill(0);
  return heights.map((height) => {
    let target = 0;
    for (let c = 1; c < columns; c++) {
      if (columnHeights[c] < columnHeights[target]) target = c;
    }
    const pos = {
      x: Math.floor(target * (CARD_W + GAP)),
      y: Math.floor(columnHeights[target]),
    };
    columnHeights[target] += height + GAP;
    return pos;
  });
}

/**
 * 画布底部左侧追加位:新分组的默认落点(「第一个空位」的简单实现,同原型)。
 * 连续 count 个按堆叠步长顺次排开;高度未知,用代理卡高推底。
 */
export function appendPositions(
  groups: readonly Pick<Group, "x" | "y">[],
  count = 1
): CanvasPos[] {
  const bottom = groups.reduce(
    (max, g) => Math.max(max, g.y + CARD_PROXY_H),
    0
  );
  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: bottom + i * STACK_STEP,
  }));
}

/**
 * V3+ 坐标校验钳回:非负;x 钳回画布右界(画布向下无界,y 只压非负)。
 * 右界随画布宽(schema v4);非有限值(NaN/±Infinity)归 0;
 * 界内值逐字保留(不取整,备份往返无损)。
 */
export function clampToCanvas(
  pos: CanvasPos,
  canvasW = DEFAULT_CANVAS_W
): CanvasPos {
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  return {
    x: Math.min(Math.max(x, 0), canvasW - CARD_W),
    y: Math.max(y, 0),
  };
}

/**
 * ---- 拖拽对齐吸附(canvas-bounds-align)----
 * 纯几何:被拖卡与其余卡(及画布边线)的边线对齐,阈值内吸到精确对齐,
 * 并给出辅助线描述(渲染归组件)。对象吸附优先于网格吸附由调用方落实。
 */

/** 对齐吸附阈值(px,含边界):边线距离在此内即吸附。 */
export const ALIGN_PX = 8;
/** 辅助线在参与卡并集跨度外再延伸的呼吸位(px)。 */
export const GUIDES_PAD = 8;

/** 画布坐标系的矩形(被拖卡/其余卡)。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 对齐辅助线:axis x = 纵向线(at 为 x 坐标),axis y = 横向线(at 为 y 坐标);
 * from/to 为交叉轴跨度;canvas 为画布边线/中线,贯穿整幅(from/to 不用)。
 */
export interface AlignGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
  canvas?: boolean;
}

/** 矩形在某轴上的三条对齐源线:起(左/上)/中/末(右/下)。 */
export function alignRects(rect: Rect, axis: "x" | "y"): number[] {
  const start = axis === "x" ? rect.x : rect.y;
  const size = axis === "x" ? rect.w : rect.h;
  return [start, start + size / 2, start + size];
}

/** snapAlignment 结果:x/y 为对齐后坐标(null = 该轴无对齐,坐标保持拖拽原值)。 */
export interface AlignSnap {
  x: number | null;
  y: number | null;
  guides: AlignGuide[];
}

/**
 * 对齐吸附(每轴至多一条):被拖卡 左/中/右(x)或 上/中/下(y)源线
 * 与其余卡目标线、画布 左/中/右(x)或上(y)线配对,取最近一对(阈值内、
 * 含边界;等距卡片目标优先于画布线,先见者胜)。
 * 吸附坐标 = 被拖起点 + delta;辅助线跨度取被拖卡与同线各卡并集 ±PAD
 * (压回画布),画布线贯穿整幅。
 */
export function snapAlignment(
  dragged: Rect,
  others: readonly Rect[],
  canvasW: number,
  threshold = ALIGN_PX
): AlignSnap {
  const snap: AlignSnap = { x: null, y: null, guides: [] };

  for (const axis of ["x", "y"] as const) {
    const sources = alignRects(dragged, axis);
    // 卡片目标线(同线合主,owners 记同线各卡供跨度并集)
    const cardLines: { at: number; owners: Rect[] }[] = [];
    for (const other of others) {
      for (const at of alignRects(other, axis)) {
        const same = cardLines.find((l) => Math.abs(l.at - at) < 0.5);
        if (same) same.owners.push(other);
        else cardLines.push({ at, owners: [other] });
      }
    }
    const canvasLines = axis === "x" ? [0, canvasW / 2, canvasW] : [0];

    // 候选对先收集后择优:等距时先见者胜(卡片先于画布,源线起/中/末有序)
    const pairs: {
      delta: number;
      distance: number;
      at: number;
      canvas: boolean;
      owners: Rect[];
    }[] = [];
    const consider = (at: number, canvas: boolean, owners: Rect[]) => {
      for (const source of sources) {
        const distance = Math.abs(at - source);
        if (distance > threshold) continue;
        pairs.push({ delta: at - source, distance, at, canvas, owners });
      }
    };
    for (const line of cardLines) consider(line.at, false, line.owners);
    for (const at of canvasLines) consider(at, true, []);
    const best = pairs.reduce<(typeof pairs)[number] | null>(
      (best, pair) => (!best || pair.distance < best.distance ? pair : best),
      null
    );
    if (!best) continue;

    const start = axis === "x" ? dragged.x : dragged.y;
    const aligned = start + best.delta;
    if (axis === "x") snap.x = aligned;
    else snap.y = aligned;

    if (best.canvas) {
      snap.guides.push({ axis, at: best.at, from: 0, to: 0, canvas: true });
      continue;
    }
    // 卡片线:被拖卡 + 同线各卡的交叉轴并集 ± 呼吸位(压回画布)
    const involved = [dragged, ...best.owners];
    if (axis === "x") {
      const from = Math.max(
        0,
        Math.min(...involved.map((r) => r.y)) - GUIDES_PAD
      );
      const to = Math.max(...involved.map((r) => r.y + r.h)) + GUIDES_PAD;
      snap.guides.push({ axis, at: best.at, from, to });
    } else {
      const from = Math.max(
        0,
        Math.min(...involved.map((r) => r.x)) - GUIDES_PAD
      );
      const to = Math.min(
        canvasW,
        Math.max(...involved.map((r) => r.x + r.w)) + GUIDES_PAD
      );
      snap.guides.push({ axis, at: best.at, from, to });
    }
  }

  return snap;
}
