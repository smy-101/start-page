import { initContextMenuFavorite } from './contextMenus'
import { initToolbar } from './toolbar'

// MV3 service worker 入口:事件监听必须在顶层同步注册;各功能的接线在此汇聚,一项一行,便于并行工单合并。
initToolbar()
initContextMenuFavorite()
