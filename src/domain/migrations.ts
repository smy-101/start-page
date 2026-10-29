/**
 * schema 迁移链(存储加载与 JSON 导入共用):任意可接受版本的状态 → 当前 SCHEMA_VERSION。
 *
 * v1→v2 无数据变换(icon 为可选字段);v2→v3 分组装箱出画布坐标——
 * 高度未知时均匀铺开退化:按 order 序三列轮流派位,每卡推高固定步长
 * 72px(原型引导堆叠口径);收集箱保留组同迁。
 * 幂等:已是当前版本的状态原引用返回(不重排、不落盘)。
 */
import type { BookmarkState } from "./types";
import { byOrder, SCHEMA_VERSION } from "./types";
import { CANVAS_COLUMNS, CARD_W, GAP, STACK_STEP } from "./canvas";

export function migrateState(state: BookmarkState): BookmarkState {
  if (state.schemaVersion >= SCHEMA_VERSION) return state;
  const groups = [...state.groups].sort(byOrder).map((group, i) => ({
    ...group,
    // 列序 ×(卡宽+间距)向下取整:坐标约定 int px,且不越过钳回右界
    // (CANVAS_W − CARD_W = 810.67…,round 会得出 811 导致往返被改写)
    x: Math.floor((i % CANVAS_COLUMNS) * (CARD_W + GAP)),
    y: Math.floor(i / CANVAS_COLUMNS) * STACK_STEP,
  }));
  return { ...state, schemaVersion: SCHEMA_VERSION, groups };
}
