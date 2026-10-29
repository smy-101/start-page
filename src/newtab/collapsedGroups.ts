/**
 * 折叠/展开是 UI 状态而非领域数据:走 localStorage 侧通道持久化,
 * 不进 chrome.storage.local 里的单一状态对象(刷新后保持由这里承担)。
 *
 * 工单 10b(懒挂载):键是否存在区分「已记录偏好」与「从未记录」——
 * 已记录(哪怕空集 = 老用户明确全展开)一律照办,升级不重置;
 * 未记录时由 App 首启判定缺省:全新安装 → 全部折叠,老用户 → 维持展开。
 */
import type { GroupId } from "../domain/types";

const COLLAPSED_KEY = "start-page:collapsed-groups";

/** 偏好读取结果:recorded = 键已存在(明确的用户选择或老版本遗留);ids = 折叠分组集合。 */
export type CollapsedGroupsPreference = {
  recorded: boolean;
  ids: Set<GroupId>;
};

export function loadCollapsedGroups(): CollapsedGroupsPreference {
  let raw: string | null;
  try {
    raw = localStorage.getItem(COLLAPSED_KEY);
  } catch {
    // localStorage 不可用:当作未记录,ids 用空集(当次会话内仍可折叠)
    return { recorded: false, ids: new Set() };
  }
  if (raw === null) return { recorded: false, ids: new Set() };
  try {
    const parsed: unknown = JSON.parse(raw);
    // 形状损坏按「已记录的空集」处理:不回退到全新安装缺省,避免老用户视图突变
    if (!Array.isArray(parsed)) return { recorded: true, ids: new Set() };
    return {
      recorded: true,
      ids: new Set(
        parsed.filter((id): id is GroupId => typeof id === "string")
      ),
    };
  } catch {
    return { recorded: true, ids: new Set() };
  }
}

export function saveCollapsedGroups(ids: Set<GroupId>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // 存不进去只影响“刷新后保持”,不影响当次会话
  }
}
