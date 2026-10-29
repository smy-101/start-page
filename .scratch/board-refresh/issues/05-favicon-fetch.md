# 05 添加收藏时抓取网页图标并保存

Status: done

## 问题

`_favicon` 端点只有访问过的站点有图;手动添加/导入的收藏大量回退首字母方块(反馈 #4)。

## 方案

- **schema v2**:`Bookmark` 增可选 `icon?: string`(data URL)。SCHEMA_VERSION → 2;
  `statesEqual` 纳入 icon 比较;导入 JSON 兼容 v1/v2。
- 抓取模块 `src/domain/fetchSiteIcon.ts`(纯逻辑 + 注入 fetch,零 chrome 依赖):
  fetch 页面 HTML(超时 ~5s)→ DOMParser 解析 `<link rel~=icon|shortcut|apple-touch-icon>`
  (优先声明尺寸大的)→ 相对地址按页面 URL 解析 → fetch 图标 → blob → data URL;
  无 link 标签时试 `${origin}/favicon.ico`。体积 >128KB 或非图片放弃。
  顺带解析 `<title>`(添加弹窗标题留空时用,替代裸主机名)。
- 权限:manifest 增 `optional_host_permissions: ['<all_urls>']`。
  初始页添加提交时,若权限未授予则 `chrome.permissions.request`(提交手势内);
  拒绝过就不再弹(设置里不另做开关,权限管理交给 chrome://extensions)。
  service worker(工具栏/右键)同模块:`permissions.contains` 判断,不主动弹窗。
- 接入点:初始页 AddDialog、SW 工具栏收藏、SW 右键收藏。均「先添加、后补图标」:
  addBookmark 返回后异步补 icon 存回(不阻塞添加)。
- 原生导入不批量抓(见 spec 边界)。

## 验收

- 单测:HTML 解析(多 link、相对路径、无 link)、尺寸挑选、超时/非图放弃、v1→v2 迁移。
- 权限拒绝时添加流程不受影响;`npm test`、typecheck、build 过。

## Comments

- 2026-10-29 实现:SCHEMA_VERSION 2 + Bookmark.icon;domain/fetchSiteMeta(正则解析,
  SW 可用,注入 fetch 可测);optional_host_permissions + 提交手势请求授权,拒绝自动关开关
  (设置页新增「网页图标」开关可重新打开);弹窗/工具栏/右键三入口「先添加后补图标」;
  v1 备份仍可导入,顺带解析 <title> 回填留空标题。
