import type { BookmarkState } from '../domain/types'
import type { BookmarkStore } from '../domain/store'
import { createBookmarkStore } from '../domain/store'
import type { Group } from '../domain/types'
import { createChromeStorage } from '../storage/chromeStorage'
import { favoriteToGroup, findBookmarkByUrl, unfavoriteByUrl } from './favoriteAction'
import { UNFAVORITE_ID, buildContextMenuItems, parseGroupMenuItemId } from './menuSpecs'

/**
 * 右键菜单接线:结构来自 menuSpecs(纯数据),点击语义来自 favoriteAction(纯逻辑),
 * 这里只做 chrome.contextMenus / chrome.storage / chrome.tabs 事件翻译。
 * 薄适配层,按 spec Testing Decisions 不单测,靠 dist 冒烟(工单 09)覆盖。
 */

const storage = createChromeStorage()

/**
 * 每次事件新建库实例:建库即从存储加载最新状态,
 * 避免新标签页等其它上下文写入后 SW 持有旧快照(收藏/移动判定失真)。
 */
function openStore(): Promise<BookmarkStore> {
  return createBookmarkStore(storage)
}

/** create 的错误只经 runtime.lastError 暴露,Promise 化以便顺序创建父/子项。 */
function createMenuItem(createProperties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(createProperties, () => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve()
    })
  })
}

/** 分组增删/改名/重排才需要重建;收藏增删只需刷新「取消收藏」可见性。 */
function groupsSignature(groups: Group[]): string {
  return groups.map((g) => `${g.id}\x00${g.name}\x00${g.order}`).join('\n')
}

let builtSignature: string | null = null

/** 菜单变更串行化:避免并发 removeAll/create 交叉造成重复 id;错误吞掉并记日志,不影响其它事件。 */
let menuQueue: Promise<void> = Promise.resolve()
function enqueueMenuJob(job: () => Promise<void>): void {
  menuQueue = menuQueue.then(job).catch((error) => {
    console.error('右键菜单接线异常:', error)
  })
}

async function rebuildMenus(groups: Group[]): Promise<void> {
  const signature = groupsSignature(groups)
  if (signature !== builtSignature) {
    // 菜单跨 SW 重启与浏览器会话持久存在,标准模式:removeAll 后按当前分组重建
    await chrome.contextMenus.removeAll()
    for (const item of buildContextMenuItems(groups)) {
      await createMenuItem(item)
    }
    builtSignature = signature
  }
  await refreshUnfavoriteVisibility()
}

/** 「取消收藏」只在当前活动标签页的 URL 已被收藏时可见。 */
function refreshUnfavoriteVisibility(): Promise<void> {
  return (async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    let visible = false
    if (tab?.url) {
      const store = await openStore()
      visible = findBookmarkByUrl(store, tab.url) !== null
    }
    // 菜单项尚不存在(如安装后首次事件早于 onInstalled)时 update 会 reject,由队列吞掉
    await chrome.contextMenus.update(UNFAVORITE_ID, { visible })
  })()
}

export function initContextMenuFavorite(): void {
  // 安装/更新时建立初始菜单
  chrome.runtime.onInstalled.addListener(() => {
    enqueueMenuJob(async () => {
      const store = await openStore()
      await rebuildMenus(store.getState().groups)
    })
  })

  // 状态对象整体替换:分组有变 → 重建;仅有收藏增删 → 落到可见性刷新(写方自身也会收到通知)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.state) return
    const next = changes.state.newValue as BookmarkState | undefined
    enqueueMenuJob(() => rebuildMenus(next?.groups ?? []))
  })

  // 「取消收藏」可见性跟随活动标签页切换与页面加载
  chrome.tabs.onActivated.addListener(() => {
    enqueueMenuJob(refreshUnfavoriteVisibility)
  })
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === 'complete') enqueueMenuJob(refreshUnfavoriteVisibility)
  })

  // 菜单点击:全部写操作走领域层(规范化判重与不变量在那里保证);写后 storage.onChanged 会刷新菜单状态
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const pageUrl = info.pageUrl ?? tab?.url
    if (!pageUrl) return
    const groupId = parseGroupMenuItemId(info.menuItemId)
    if (groupId === null && info.menuItemId !== UNFAVORITE_ID) return
    void (async () => {
      const store = await openStore()
      if (groupId !== null) {
        await favoriteToGroup(store, pageUrl, tab?.title, groupId)
      } else {
        await unfavoriteByUrl(store, pageUrl)
      }
    })().catch((error) => {
      console.error('右键收藏写入失败:', error)
    })
  })
}
