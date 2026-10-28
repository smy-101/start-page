import { initContextMenuFavorite } from './contextMenus'

// MV3 service worker:事件监听必须在顶层同步注册;各能力的接线分散在独立模块(工单 05 会再加工具栏接线)
initContextMenuFavorite()
