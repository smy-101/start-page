import type { DomainErrorCode } from "../domain/types";
import type { ImportReport } from "../domain/importExport";

/** 领域错误码 → 中文提示。 */
export const domainErrorText: Record<DomainErrorCode, string> = {
  "invalid-url": "网址无效,请输入完整网址",
  "duplicate-url": "该网址已在收藏中",
  "bookmark-not-found": "该收藏已不存在",
  "group-not-found": "分组已不存在",
  "empty-group-name": "分组名不能为空",
  "empty-group-color": "请为分组选择颜色",
  "invalid-import": "文件不是有效的初始页备份或书签文件",
  "invalid-group-order": "分组顺序数据不完整,请重试",
  "inbox-immutable": "收集箱是保留分组,不能删除或改名换色",
  "todo-not-found": "待办卡已不存在",
  "todo-item-not-found": "待办条目已不存在",
  "empty-todo-text": "待办内容不能为空",
  "invalid-todo-order": "待办顺序数据不完整,请重试",
};

/** 导入结果统计 → 中文提示(设置页原生导入与导入导出共用)。 */
export function importReportText(report: ImportReport): string {
  return `新增 ${report.added} 条、跳过 ${report.skipped} 条`;
}
