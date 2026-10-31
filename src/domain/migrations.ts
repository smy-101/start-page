/**
 * schema 迁移链(存储加载与 JSON 导入共用):任意可接受版本的状态 → 当前 SCHEMA_VERSION。
 *
 * 按版本分段执行(已是目标版本的分段跳过):v1→v2 无数据变换(icon 为可选字段);
 * v2→v3 分组装箱出画布坐标——高度未知时均匀铺开退化:按 order 序三列轮流派位,
 * 每卡推高固定步长 72px(原型引导堆叠口径);收集箱保留组同迁;
 * v3→v4 补画布宽缺省 1200(canvas-bounds-align,坐标不动);
 * v4→v5 画布宽自动档(canvas-bounds-align/04):v4 曾给全部存量回填默认 1200,
 * 与「用户调过」无法区分——恰等于默认值的按回填到高剥离回自动档
 * (刻意调回 1200 的会被误判,重拖一次拖柄即恢复固定)。
 * v5→v6 每行条数(group-width-tint):分组可选 columns 无数据回填
 * (缺省 = 1 = 存量宽行单列);仅剥离非法值(非有限/非整数/越 1..6)。
 * v6→v7 组宽档位(group-span-decouple):零数据改写——缺省档位从每行
 * 条数推导,v6 全部状态渲染逐字不变,仅升版本号。
 * v7→v8 待办卡(todo-card,ADR-0006):零改写——补缺省 todos: []
 * (升级不预置示例卡);分组/收藏引用原样保留。
 * v8→v9 待办卡宽档位与卡色(todo-card-size-color):零数据改写——
 * 缺省档位 1 = CARD_W、缺省无色 = 中性,v8 全部状态渲染逐字不变,
 * 仅升版本号。
 * v9→v10 待办卡自由宽(todo-card-size-color 调校):档位制退役——
 * 已存 span 按旧档位数学换算为 px 存 width、剥离 span;无 span 的卡
 * 零改写(缺省 = CARD_W 渲染逐字不变)。v9 未发布,仅本地开发版数据
 * 走此换算。
 * v10→v11 待办卡定长高(todo-height-archive):零数据改写——缺省
 * undefined = 自适应,v10 全部状态渲染逐字不变,仅升版本号。
 * 末尾统一修复(任何版本,含已是当前版):宽度存在但非法(NaN/越界)钳回;
 * 缺省 = 自动档,不补数值;columns/span 存在但非法一律剥离(缺省:
 * columns 装满 / span 从 columns 推导);合法 columns > 合法 span 时抬 span
 * 到 columns(宽到装得下,不丢排版;手改 JSON 的兑底);
 * todos 里非法 width(非有限/越界/非整数)钳回、残留 span(v9 遗物)
 * 剥离、非 string color 剥离;非法 height(非有限剥离——高的缺省是
 * 「不定长」而非定值,垃圾值归 undefined 而非物化定长;有限越界/非整数
 * 钳回 [176, 720])。
 * 幂等:已是当前版本且无需修复的状态原引用返回(不重排、不落盘)。
 */
import type { BookmarkState, TodoCard } from "./types";
import { byOrder } from "./types";
import {
  CARD_W,
  DEFAULT_CANVAS_W,
  MAX_GROUP_COLUMNS,
  clampCanvasWidth,
  clampTodoHeight,
  clampTodoWidth,
  spreadPositions,
} from "./canvas";

export function migrateState(state: BookmarkState): BookmarkState {
  let next = state;
  if (next.schemaVersion < 3) {
    const positions = spreadPositions(next.groups.length);
    const groups = [...next.groups].sort(byOrder).map((group, i) => ({
      ...group,
      ...positions[i],
    }));
    next = { ...next, schemaVersion: 3, groups };
  }
  if (next.schemaVersion < 4) {
    next = { ...next, schemaVersion: 4, canvasWidth: DEFAULT_CANVAS_W };
  }
  if (next.schemaVersion < 5) {
    const { canvasWidth, ...rest } = next;
    next =
      canvasWidth === DEFAULT_CANVAS_W
        ? { ...rest, schemaVersion: 5 }
        : { ...next, schemaVersion: 5 };
  }
  if (next.schemaVersion < 6) {
    // v5→v6:非法 columns 剥离(合法值原样保留;缺省不补数值)
    const groups = next.groups.some((g) => !isValidStep(g.columns))
      ? next.groups.map((g) =>
          isValidStep(g.columns) ? g : { ...g, columns: undefined }
        )
      : next.groups;
    next = { ...next, schemaVersion: 6, groups };
  }
  if (next.schemaVersion < 7) {
    // v6→v7 零数据改写(group-span-decouple):缺省档位从每行条数推导,
    // v6 全部状态渲染逐字不变(groups 引用原样保留)
    next = { ...next, schemaVersion: 7 };
  }
  if (next.schemaVersion < 8) {
    // v7→v8 零改写(todo-card):分组/收藏引用原样保留;todos 缺省补空
    // 数组在末尾统一修复处一并承担(v7 与 v8 缺失同路)
    next = { ...next, schemaVersion: 8 };
  }
  if (next.schemaVersion < 9) {
    // v8→v9 零数据改写(todo-card-size-color):缺省档位 1 = CARD_W、
    // 缺省无色 = 中性,v8 全部状态渲染逐字不变(todos 引用原样保留);
    // 非法值剥离在末尾统一修复处承担(v8 与 v9 同路)
    next = { ...next, schemaVersion: 9 };
  }
  if (next.schemaVersion < 10) {
    // v9→v10(todo-card-size-color 调校):档位制退役改自由宽——已存 span
    // 按旧档位数学换算为 px 存 width、剥离 span;无 span 的卡零改写
    // (数组与元素引用均保留)。非法档位(非整数/越 1..5)归档 1 后换算
    if (next.todos) {
      let converted = false;
      const todos = next.todos.map((tRaw: TodoCard & { span?: number }) => {
        if (tRaw.width !== undefined) {
          if (tRaw.span === undefined) return tRaw;
          converted = true;
          return { ...tRaw, span: undefined };
        }
        if (tRaw.span === undefined) return tRaw;
        converted = true;
        return { ...tRaw, width: legacySpanWidth(tRaw.span), span: undefined };
      });
      if (converted) next = { ...next, todos };
    }
    next = { ...next, schemaVersion: 10 };
  }
  if (next.schemaVersion < 11) {
    // v10→v11 零数据改写(todo-height-archive):缺省 undefined = 自适应,
    // v10 全部状态渲染逐字不变(todos 引用原样保留);非法值剥离/钳回
    // 在末尾统一修复处承担(v10 与 v11 同路)
    next = { ...next, schemaVersion: 11 };
  }
  // 缺省 = 自动档(schema v5),修复仅针对已存在的非法值
  if (
    next.canvasWidth !== undefined &&
    next.canvasWidth !== clampCanvasWidth(next.canvasWidth)
  ) {
    next = { ...next, canvasWidth: clampCanvasWidth(next.canvasWidth) };
  }
  // 统一修复(含已是当前版的状态):columns/span 非法一律剥离;
  // 合法 columns > 合法 span 抬 span(幂等:干净状态 groups 引用不变,
  // 整体原引用返回)
  if (next.groups.some((g) => needsSizingRepair(g))) {
    next = {
      ...next,
      groups: next.groups.map((g) => {
        const columns = isValidStep(g.columns) ? g.columns : undefined;
        const span = isValidStep(g.span) ? g.span : undefined;
        return columns !== undefined && span !== undefined && columns > span
          ? { ...g, columns, span: columns }
          : { ...g, columns, span };
      }),
    };
  }
  // todos 缺省/非数组(todo-card,v8):补空数组——手改 JSON 与损坏数据的
  // 兑底;已是数组的原引用保留(幂等:干净状态整体原引用返回)
  if (!Array.isArray(next.todos)) {
    next = { ...next, todos: [] };
  }
  // todos 修复(todo-card-size-color,v10):统一走 normalizeTodoCard
  // (width 钳回/color 剥非 string/height 钳回或剥/残遗 span 剥离)。
  // 已是干净数组引用保留(幂等:干净状态整体原引用返回)
  else if (next.todos.some((t) => needsTodoRepair(t))) {
    next = {
      ...next,
      todos: next.todos.map((t) => normalizeTodoCard(t)),
    };
  }
  return next;
}

/** v9 档位数学(档案口径,仅 v9→v10 换算与 v9 备份导入用):
 * 档 k → floor(CARD_W + (k−1) × 95);非法(非整数/越 1..5)归档 1。 */
export function legacySpanWidth(span: number | undefined): number {
  const k =
    span !== undefined && Number.isInteger(span) && span >= 1 && span <= 5
      ? span
      : 1;
  return Math.floor(CARD_W + (k - 1) * 95);
}
/** 档位/每行条数共用合法域:缺省(与推导/装满同义)或有限整数 1..上限。 */
function isValidStep(value: number | undefined): boolean {
  return (
    value === undefined ||
    (Number.isInteger(value) && value >= 1 && value <= MAX_GROUP_COLUMNS)
  );
}

/** 档位/每行条数需修复:任一非法,或合法 columns 超出合法 span。 */
function needsSizingRepair(g: { span?: number; columns?: number }): boolean {
  if (!isValidStep(g.span) || !isValidStep(g.columns)) return true;
  return g.span !== undefined && g.columns !== undefined && g.columns > g.span;
}

/**
 * 待办卡字段规范化(todo-review-followups/02):迁移终末修复与导入
 * 恢复(restoreFrom)共用的单一收口。宽钳回(floor/越界,非有限归
 * 缺省 389;bound 供恢复路径随画布宽收窄,缺省仅 TODO_W_MAX)、
 * color 非 string 剥离(修复漂移:恢复路径此前原样放行)、height 有限
 * 钳回/非有限剥离为自适应(垃圾值不物化定长)、span 残遗(v9 遗物)
 * 一律剥离。span 的 v9 换算不入此:v9→v10 属迁移步骤,v10 残遗 span
 * 只剥不换(口径见 migrations.test「残留 span 剥离」),恢复侧需换算
 * 时先自行求出 raw 宽再传入。输出不物化 undefined 值键(干净形状)。
 */
export function normalizeTodoCard<S extends TodoCard>(
  t: S & { span?: unknown; width?: unknown; color?: unknown; height?: unknown },
  opts?: { bound?: number }
): S {
  const rest: typeof t = { ...t };
  const width = rest.width;
  const color = rest.color;
  const height = rest.height;
  // 待规范四字段从副本剥离,再按条件物化(不残留 undefined 值键)
  delete rest.span;
  delete rest.width;
  delete rest.color;
  delete rest.height;
  // bound 只在恢复路径给出:Math.min 仅数值宽参与,保持两条旧路径各自的
  // 垃圾宽口径——迁移(无 bound)直入 clampTodoWidth(非有限→389);
  // 恢复(有 bound)沿旧式先 min(字符串等垃圾随旧语义隐式强转)
  const clampedWidth =
    width === undefined
      ? undefined
      : clampTodoWidth(
          typeof width === "number" && opts?.bound !== undefined
            ? Math.min(width, opts.bound)
            : (width as number)
        );
  const clampedHeight =
    typeof height === "number" && Number.isFinite(height)
      ? clampTodoHeight(height)
      : undefined;
  return {
    ...rest,
    ...(clampedWidth !== undefined ? { width: clampedWidth } : null),
    ...(typeof color === "string" ? { color } : null),
    ...(clampedHeight !== undefined ? { height: clampedHeight } : null),
  } as S;
}

/** 待办卡字段需修复(todo-card-size-color v10;height 补 v11):残留
 * span(v9 遗物)、width 非法(非有限)或钳回后变化(越界/非整数)、
 * color 非 string、height 同口径(非有限 → 剥离为自适应)。 */
function needsTodoRepair(t: {
  span?: unknown;
  width?: unknown;
  color?: unknown;
  height?: unknown;
}): boolean {
  if (t.span !== undefined) return true;
  if (t.color !== undefined && typeof t.color !== "string") return true;
  const w = t.width;
  if (w !== undefined && clampTodoWidth(w as number) !== w) return true;
  const h = t.height;
  return (
    h !== undefined &&
    (typeof h !== "number" || !Number.isFinite(h) || clampTodoHeight(h) !== h)
  );
}
