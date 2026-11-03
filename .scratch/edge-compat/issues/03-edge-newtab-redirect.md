# 03 — Edge 新标签页标签图标:重定向垫片(B 方案)

**Status:** done
**Labels:** bug, edge-compat

## 背景

02 终局(wontfix)后用户要求尝试 B 方案:让 Edge 的 NTP 标签 URL 变成 `chrome-extension://…`,
标签图标改由扩展图标/favicon 渲染,绕开 `edge://newtab` 固定「文档」占位图。

## 实测依据(Edge 156.0.4314.58,干净配置)

- 无重定向:`edge://newtab` 标签 = 内置文档图标(见 02)。
- 重定向到 `chrome-extension://<id>/src/newtab/index.html` 后:标签显示彩色品牌图标。
- 页面内功能正常(收集箱、搜索、导入引导均可渲染)。

## 实现

- `src/background/newtabRedirect.ts`:UA 含 `Edg/` 时监听 `tabs.onCreated`,
  `pendingUrl`/`url` 命中 `edge://newtab` → `tabs.update` 到 `src/newtab/index.html`;
  重定向失败只告警,不影响开标签。非 Edge(含 Chrome)不注册监听,零行为。
- `src/background/index.ts` 顶层接线(MV3 事件监听须同步注册)。
- 单测 `newtabRedirect.test.ts` 14 例:UA 判定、URL 判定、接线、失败静默。

## 代价(用户已确认接受)

- 地址栏显示 `extension://<id>/src/newtab/index.html`(Edge 省略 `chrome-` 前缀);
- Ctrl+T 后地址栏 URL 处于选中态;开新标签可能有极短的重定向间隙;
- NTP 标签的 URL 不再是 `edge://newtab`(Back 行为等与之前不同)。

## 验收

- [x] 单测 / typecheck / lint / 全量 552 例通过(Node 24,与 CI 一致)
- [x] `npm run build` 产物包含垫片
- [x] 真机 Edge:CDP 新建 NTP、真实 Ctrl+T 均落到扩展页且标签显示品牌图标;
      `https://example.com` 等普通新标签不受影响
- [x] 用户真机验收(地址栏暴露的扩展 URL 可接受,2026-11-03 通过)

## Comments

- 2026-11-03 实现并真机验证;README 增加「Edge 兼容说明」。Chrome 分支由 UA 门禁隔离,无行为变化。
- 2026-11-03 用户真机验收通过;/code-review 两轴评审:无硬违规、无缺失,3 条 P2 判断题裁定——
  (1) NEWTAB_PAGE 与 manifest 双处硬编码:补同步守护测试(读 manifest.config.ts 源文本断言相等,
  不直接 import——@crxjs/vite-plugin 依赖 esbuild 在测试环境炸),单测 14 → 15 例;
  (2) isNewTabUrl 放行 chrome://newtab 属规格外防御:Edge 接受 chrome:// 别名 URL,保留,
  记于此;(3) NEWTAB_PAGE 命名 vs GLOSSARY「初始页」:保持——manifest 键名即 newtab,
  守护测试已钉住二者,模块内命名自洽。另「index.ts 格式噪声」发现经核实撤销:.prettierrc
  明确 semi+双引号,原文件才是离群,diff 把它带入工具链标准。
