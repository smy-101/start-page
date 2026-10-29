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
import { spreadPositions } from "./canvas";

export function migrateState(state: BookmarkState): BookmarkState {
  if (state.schemaVersion >= SCHEMA_VERSION) return state;
  const positions = spreadPositions(state.groups.length);
  const groups = [...state.groups].sort(byOrder).map((group, i) => ({
    ...group,
    ...positions[i],
  }));
  return { ...state, schemaVersion: SCHEMA_VERSION, groups };
}
