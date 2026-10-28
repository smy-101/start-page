import type { BookmarkState } from './types'

/**
 * 导入导出:双格式(JSON 完整备份 / Netscape HTML 通用迁移)双向。
 * 全部为纯函数;导入经注入的存储适配器读写,与手动添加共用 normalizeUrl 判重。
 */

/** 导出 JSON:完整状态逐字序列化,可作为无损备份。 */
export function exportStateAsJson(state: BookmarkState): string {
  return JSON.stringify(state, null, 2)
}
