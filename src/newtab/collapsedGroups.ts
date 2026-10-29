/**
 * 折叠/展开是 UI 状态而非领域数据:走 localStorage 侧通道持久化,
 * 不进 chrome.storage.local 里的单一状态对象(刷新后保持由这里承担)。
 */
import type { GroupId } from '../domain/types'

const COLLAPSED_KEY = 'start-page:collapsed-groups'

export function loadCollapsedGroups(): Set<GroupId> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is GroupId => typeof id === 'string'))
  } catch {
    // localStorage 不可用或数据损坏:当作全部展开
    return new Set()
  }
}

export function saveCollapsedGroups(ids: Set<GroupId>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]))
  } catch {
    // 存不进去只影响“刷新后保持”,不影响当次会话
  }
}
