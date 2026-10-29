import type { Group } from '../domain/types'

/**
 * 右键菜单结构(纯数据构建,零 chrome 运行时依赖,可单测):
 * 「收藏到」根项 → 按分组顺序的子菜单(收集箱 + 自定义分组),另有「取消收藏」根项。
 * 接线层(contextMenus.ts)负责 create/update 与事件翻译。
 */

export const SAVE_TO_ROOT_ID = 'sp-save-to'
export const UNFAVORITE_ID = 'sp-unfavorite'

/** 仅普通网页(http/https)出现菜单项;chrome:// 等特殊页靠 documentUrlPatterns 声明式排除,无运行时竞态。 */
const PAGE_URL_PATTERNS: [string, ...string[]] = ['http://*/*', 'https://*/*']

/** 分组子菜单项 id:确定且可反解,onClicked 里据此拿到目标分组。 */
export function groupMenuItemId(groupId: string): string {
  return `${SAVE_TO_ROOT_ID}:${groupId}`
}

export function parseGroupMenuItemId(menuItemId: string | number): string | null {
  if (typeof menuItemId !== 'string') return null
  const prefix = `${SAVE_TO_ROOT_ID}:`
  return menuItemId.startsWith(prefix) ? menuItemId.slice(prefix.length) : null
}

export function buildContextMenuItems(groups: Group[]): chrome.contextMenus.CreateProperties[] {
  const items: chrome.contextMenus.CreateProperties[] = [
    {
      id: SAVE_TO_ROOT_ID,
      title: '收藏到',
      contexts: ['page'],
      documentUrlPatterns: PAGE_URL_PATTERNS,
    },
  ]
  for (const group of [...groups].sort((a, b) => a.order - b.order)) {
    items.push({
      id: groupMenuItemId(group.id),
      parentId: SAVE_TO_ROOT_ID,
      title: group.name,
      contexts: ['page'],
      documentUrlPatterns: PAGE_URL_PATTERNS,
    })
  }
  // 「取消收藏」默认不可见:是否显示随当前活动标签页是否已收藏切换(见 contextMenus.ts)
  items.push({
    id: UNFAVORITE_ID,
    title: '取消收藏',
    contexts: ['page'],
    documentUrlPatterns: PAGE_URL_PATTERNS,
    visible: false,
  })
  return items
}
