/**
 * 画布几何(ADR-0004、GLOSSARY「画布」):分组卡的固定宽排版平面。
 * 基准 1200px、三列、间距 16;坐标为 px,存于分组(schema v3)。
 * 纯数学、无 DOM:测量与拖挂在组件层(白板模式,board-whiteboard/02)。
 */
import type { Group } from "./types";
import type { CanvasPos } from "./types";

export type { CanvasPos } from "./types";

export const CANVAS_W = 1200;
export const GAP = 16;
/** 卡宽 = (1200 − 2×16)/3 ≈ 389.33(原型口径);不入库,全局唯一常量。 */
export const CARD_W = (CANVAS_W - GAP * 2) / 3;
/** 三列 = 3×卡宽 + 2×间距 = 1200 恰好铺满。 */
export const CANVAS_COLUMNS = 3;
/** 引导堆叠步长(原型口径):迁移铺开的行距、连续新组的间距。 */
export const STACK_STEP = 72;
/** 无测量时的代理卡高:推算「画布底部」用。 */
const CARD_PROXY_H = 48;

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
 * V3 坐标校验钳回:非负;x 钳回画布右界(画布向下无界,y 只压非负)。
 * 非有限值(NaN/±Infinity)归 0;界内值逐字保留(不取整,备份往返无损)。
 */
export function clampToCanvas(pos: CanvasPos): CanvasPos {
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  return {
    x: Math.min(Math.max(x, 0), CANVAS_W - CARD_W),
    y: Math.max(y, 0),
  };
}
