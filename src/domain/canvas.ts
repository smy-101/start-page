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
/** 卡宽 = (1200 − 2×16)/3 ≈ 389.33(原型口径);schema v6 起为「单列基准宽」,
 * 也是缺省列数(1)下的组宽;多列组宽见 groupWidthOf(group-width-tint)。 */
export const CARD_W = (DEFAULT_CANVAS_W - GAP * 2) / 3;
/** 组内收藏格宽(px,group-width-tint):CSS minmax(184px, 1fr) 同一口径。 */
export const CELL_W = 184;
/** 组内收藏格间距(px):与 .group-grid gap 同源。 */
export const CELL_GAP = 6;
/** 组宽推算的固定横向开销(px):组边框 1×2 + 组横 padding 8×2 + 网格横
 * padding 4×2 + 滚动槽 12(网格 scrollbar-gutter: stable 常驻预留;
 * 滚动条自定宽 8px(scrollbar-fix),留余量——不预留则列内容滚出时塌列)。 */
export const GROUP_EDGE = 38;
/** 每行条数/组宽档位共用上限(档 6 宽 1172 ≤ 默认画布 1200,再多横条格过窄)。 */
export const MAX_GROUP_COLUMNS = 6;
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
 * 组宽推导(group-width-tint,schema v6):每行条数 c → 渲染宽(px),不存 px。
 * c=1 → CARD_W(存量单列宽行观感逐字不变);c≥2 → 固定开销 + c 格 + (c−1) 格距,
 * 内宽恰装 c 格(auto-fill minmax 的精确边界)。非法(非有限/非正整数)归 1。
 * schema v7 起入参是组宽档位 span(见 groupSpanOf),数学不动。
 */
export function groupWidthOf(columns?: number): number {
  const c =
    columns !== undefined &&
    Number.isInteger(columns) &&
    columns >= 1 &&
    columns <= MAX_GROUP_COLUMNS
      ? columns
      : 1;
  if (c === 1) return CARD_W;
  return GROUP_EDGE + c * CELL_W + (c - 1) * CELL_GAP;
}

/** 宽度 → 最近档位(拖柄松手吸附档位边界,group-span-decouple):1..上限,越界钳回。 */
export function nearestGroupSpan(widthPx: number): number {
  let best = 1;
  let bestDistance = Infinity;
  for (let c = 1; c <= MAX_GROUP_COLUMNS; c++) {
    const distance = Math.abs(groupWidthOf(c) - widthPx);
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  return best;
}

/** 档位合法:正整数 1..上限;非法归 undefined(缺省间回退链用)。 */
function validStep(value: number | undefined): number | undefined {
  return value !== undefined &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_GROUP_COLUMNS
    ? value
    : undefined;
}

/**
 * 组宽档位生效值(group-span-decouple,schema v7):span 优先,缺省从每行条数
 * 推导(装满——v6 存量因此零改写迁移);非法逐级回退,终归 1。
 * 输入取 Partial<Group> 形状,组件/领域均传整组。
 */
export function groupSpanOf(group: {
  span?: number;
  columns?: number;
}): number {
  return validStep(group.span) ?? validStep(group.columns) ?? 1;
}

/**
 * 每行条数生效值(group-span-decouple,schema v7):columns 缺省 = 装满
 * (随档位);给了则防御钳 ≤ 档位(写路径恒保证,手改 JSON 的兑底)。
 * (span 4, columns 1) = 宽组清单式——本功能的落点形态。
 */
export function groupCellsOf(group: {
  span?: number;
  columns?: number;
}): number {
  const span = groupSpanOf(group);
  const cells = validStep(group.columns);
  return cells === undefined ? span : Math.min(cells, span);
}

/** ---- 待办卡宽(todo-card-size-color,spec 决定 1;自由宽调校 2026-11-14)----
 * 自由宽:不设档位(用户定案,档位制两轮调校后退役),白板模式拖卡右缘
 * 连续调宽、松手 16px 网格吸附;缺省 = CARD_W(存量零改写),
 * 下限 240px 紧凑卡(档位制以 CARD_W 为底对紧凑清单偏宽,用户反馈;
 * 240 = 勾选框 + 约 12 字/行，16 倍数),上限 768 ≈ 两倍缺省宽
 * (宽过两倍缺省即不像卡，16 倍数)。与画布网格语言一致。 */

/** 待办卡宽下限(px，16 倍数):紧凑卡仍容得下勾选框 + 一句待办。 */
export const TODO_W_MIN = 240;
/** 待办卡宽上限(px，16 倍数):约两倍缺省宽，再宽超出清单卡意义。 */
export const TODO_W_MAX = 768;

/** 待办卡宽钳回:floor 取整后钳 [MIN, MAX];非有限归 floor(CARD_W)。 */
export function clampTodoWidth(width: number): number {
  if (!Number.isFinite(width)) return Math.floor(CARD_W);
  return Math.floor(Math.min(Math.max(width, TODO_W_MIN), TODO_W_MAX));
}

/** 待办卡渲染宽:缺省 = CARD_W(逐字保留，不 floor);存在则钳回。
 * 入参取 { width } 形状，组件/领域均传整卡。 */
export function todoWidthOf(todo: { width?: number }): number {
  return todo.width === undefined ? CARD_W : clampTodoWidth(todo.width);
}

/** ---- 待办卡定长高(todo-height-archive,spec 决定 1)----
 * 定长高:可选,缺省 undefined = 自适应(存量零改写,列表约 18 行起
 * 内部滚动);定长时卡面纵向 flex、条目列表区滚动、添加行常驻可见。
 * 交互同调宽语言:白板模式拖卡底缘连续调高、松手 16px 网格吸附、
 * 键盘 ↑/↓ 步进一格。下限 176(px,16 倍数)= 卡头 + 约三行条目 +
 * 添加行(卡面固定开销约 88px);上限 720 = 略高于自适应观感上限
 * (列表 clamp 560 + 卡头/添加行 ≈ 648,16 倍数)。
 * 高不随画布宽收窄(高不参与横向几何,画布向下无界)。 */

/** 待办卡定长高下限(px,16 倍数):卡头 + 约三行条目 + 添加行。 */
export const TODO_H_MIN = 176;
/** 待办卡定长高上限(px,16 倍数):略高于自适应观感上限。 */
export const TODO_H_MAX = 720;

/** 待办卡定长高钳回:floor 取整后钳 [MIN, MAX];非有限归下界
 * (高的「缺省」是 undefined 自适应而非定值,垃圾输入当最近的
 * 合法界;与 clampTodoWidth 归缺省附近同思路)。 */
export function clampTodoHeight(height: number): number {
  if (!Number.isFinite(height)) return TODO_H_MIN;
  return Math.floor(Math.min(Math.max(height, TODO_H_MIN), TODO_H_MAX));
}

/** ---- 组定长高(group-height,spec 决定 3)----
 * 与待办卡定长高对称的旋钮:可选,缺省 undefined = 自适应(现行观感:
 * 网格 max-height clamp 内部滚动,存量零改写);定长时卡面纵向 flex、
 * 组头常驻、网格区滚动。交互同待办卡语言:白板模式拖组底缘连续调高、
 * 松手 16px 网格吸附、键盘 ↑/↓ 步进、组头钉住钮切换定长 ↔ 自适应。
 * 界限与待办卡同界(同一画布同一套数,问询定案;分立命名留给将来
 * 独立调界):下限 176 ≈ 组头 + 约两行收藏格;上限 720 略高于自适应
 * 观感上限(网格 clamp 560 + 组头)。高不随画布宽收窄(画布向下无界)。 */

/** 组定长高下限(px,16 倍数):组头 + 约两行收藏格。 */
export const GROUP_H_MIN = 176;
/** 组定长高上限(px,16 倍数):略高于自适应观感上限(同待办卡)。 */
export const GROUP_H_MAX = 720;

/** 组定长高钳回:口径同待办卡(floor 取整,非有限归下界)。 */
export function clampGroupHeight(height: number): number {
  if (!Number.isFinite(height)) return GROUP_H_MIN;
  return Math.floor(Math.min(Math.max(height, GROUP_H_MIN), GROUP_H_MAX));
}

/**
 * 组定长高规范化(group-height):有限钳回、非有限/非数剥离为 undefined
 * 自适应(垃圾值不物化定长)。迁移终末修复与导入恢复共用的单一收口
 * (同待办侧 normalizeTodoCard 的角色;不残留 undefined 值键由调用方
 * 条件物化)。
 */
export function normalizeGroupHeight(height: unknown): number | undefined {
  return typeof height === "number" && Number.isFinite(height)
    ? clampGroupHeight(height)
    : undefined;
}

/** 画布内放得下的最大组宽档位(至少 1):拖柄调宽/缩画布的钳上界。 */
export function maxSpanForCanvas(canvasW: number): number {
  for (let c = MAX_GROUP_COLUMNS; c > 1; c--) {
    if (groupWidthOf(c) <= canvasW) return c;
  }
  return 1;
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
 * 当前最矮位置贪心装箱,无行对齐空隙——原 ADR-0003 瀑布流墙的布局算法
 * 降级为整理算法,墙体退役后仅存此用途。
 * 宽度感知(group-width-tint):卡位槽仍按 CARD_W+GAP 间距列分配,宽卡占
 * k = ceil((宽+GAP)/(CARD_W+GAP)) 个连续槽,放「窗口内最高槽」最小的窗口
 * (平手靠左),组在槽跨度内居中;k=1(含缺省 widths)与旧实现逐字一致
 * (单槽跨度恰 = CARD_W)。
 * DOM/Tab 序仍由 order 承担;高度全 0(测不出,jsdom)退化零高铺开。
 */
export function packCanvas(
  heights: readonly number[],
  canvasW = DEFAULT_CANVAS_W,
  widths?: readonly number[]
): CanvasPos[] {
  if (heights.length === 0) return [];
  if (heights.every((h) => h === 0))
    return spreadPositions(heights.length, canvasW);
  const columns = columnsFor(canvasW);
  const columnHeights = new Array<number>(columns).fill(0);
  return heights.map((height, i) => {
    const w = widths?.[i] !== undefined ? widths[i] : CARD_W;
    // 占槽数:宽卡跨连续槽(单槽跨度 = CARD_W,恰容纳缺省宽)
    const slots = Math.min(
      columns,
      Math.max(1, Math.ceil((w + GAP) / (CARD_W + GAP)))
    );
    // 候选窗口:连续 slots 列,取窗口内最高槽最小者(平手靠左)
    let target = 0;
    let targetTop = Infinity;
    for (let s = 0; s + slots <= columns; s++) {
      let top = 0;
      for (let c = s; c < s + slots; c++) {
        top = Math.max(top, columnHeights[c]);
      }
      if (top < targetTop) {
        target = s;
        targetTop = top;
      }
    }
    const spanW = slots * (CARD_W + GAP) - GAP;
    const pos = {
      // 居中偏移但不出画布(宽卡跨槽溢出时靠左;组宽 ≤ 画布是常态,
      // store 已按 maxSpanForCanvas 钳过,此处仅防御)
      x: Math.max(0, Math.floor(target * (CARD_W + GAP) + (spanW - w) / 2)),
      y: Math.floor(targetTop),
    };
    for (let c = target; c < target + slots; c++) {
      columnHeights[c] = targetTop + height + GAP;
    }
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
 * 右界随画布宽(schema v4)与卡宽(group-width-tint:多列组按各自宽,
 * 缺省 CARD_W);非有限值(NaN/±Infinity)归 0;
 * 界内值逐字保留(不取整,备份往返无损)。
 */
export function clampToCanvas(
  pos: CanvasPos,
  canvasW = DEFAULT_CANVAS_W,
  cardW = CARD_W
): CanvasPos {
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  return {
    // 卡宽 > 画布宽(六列组遇窄画布)时右界为负:压回 0(左对齐溢出,
    // 优于负坐标)
    x: Math.min(Math.max(x, 0), Math.max(0, canvasW - cardW)),
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
