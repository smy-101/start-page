import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: '初始页',
  version: '0.1.0',
  description: '收藏起始页:分组管理、搜索直达、数据随时带走',
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  // 不设 default_popup → chrome.action.onClicked 可用于一键收藏(spec 实现决策)
  action: {
    default_title: '收藏到收集箱',
    default_icon: {
      '16': 'icons/outline-16.png',
      '32': 'icons/outline-32.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  chrome_url_overrides: {
    newtab: 'src/newtab/index.html',
  },
  // tabs:读取 tab.url 供工具栏图标状态判定与一键收藏
  permissions: ['storage', 'tabs', 'favicon'],
})
