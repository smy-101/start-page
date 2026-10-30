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
 * 末尾统一修复(任何版本,含已是当前版):宽度存在但非法(NaN/越界)钳回;
 * 缺省 = 自动档,不补数值;columns/span 存在但非法一律剥离(缺省:
 * columns 装满 / span 从 columns 推导);合法 columns > 合法 span 时抬 span
 * 到 columns(宽到装得下,不丢排版;手改 JSON 的兑底)。
 * 幂等:已是当前版本且无需修复的状态原引用返回(不重排、不落盘)。
 */
import type { BookmarkState } from "./types";
import { byOrder } from "./types";
import {
  DEFAULT_CANVAS_W,
  MAX_GROUP_COLUMNS,
  clampCanvasWidth,
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
  return next;
}

/** 档位/每行条数共用合法域:缺省(与推导/装满同义)或有限整数 1..上限。 */
function isValidStep(value: number | undefined): boolean {
  return (
    value === undefined ||
    (Number.isInteger(value) && value >= 1 && value <= MAX_GROUP_COLUMNS)
  );
}

/** 档位/每行条数需修复:任一非法,或合法 columns 超出合法 span。 */
function needsSizingRepair(g: {
  span?: number;
  columns?: number;
}): boolean {
  if (!isValidStep(g.span) || !isValidStep(g.columns)) return true;
  return (
    g.span !== undefined &&
    g.columns !== undefined &&
    g.columns > g.span
  );
}
