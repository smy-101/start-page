import type { GroupId } from "../domain/types";

/**
 * 折叠分组持久化(board-refresh/03):localStorage 存被折叠的分组 id 数组。
 * 纯 UI 状态,不进 chrome.storage / 导出 JSON;默认空集 = 全部展开。
 * 读取容错:损坏 JSON / 非字符串项一律忽略;不存在的分组 id 惰性无效
 * (渲染层按现存分组取值),删除分组时由 App 主动剔除。
 */
const STORAGE_KEY = "start-page.collapsed-groups";

export function loadCollapsedGroups(): Set<GroupId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is GroupId => typeof id === "string")
    );
  } catch {
    return new Set();
  }
}

export function saveCollapsedGroups(ids: Iterable<GroupId>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // 隐私模式等写入失败:折叠仅当次会话生效,不视为错误
  }
}
