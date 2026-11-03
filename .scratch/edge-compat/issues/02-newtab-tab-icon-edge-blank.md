# 02 — 初始页标签图标在 Edge 空白(水平+垂直),地址栏图标纯黑

**Status:** wontfix
**Labels:** bug, edge-compat

## What happened

用户报告(承接 01 关单后的新症状):

- Edge 水平标签栏:初始页标签图标**空白**(01 时代是纯黑块,Edge 行为已变);
- Edge 垂直标签页侧栏:同样空白;
- Edge「网页头」(地址栏侧)图标:纯黑;
- 扩展栏(工具栏按钮)图标正常;
- Chrome 同位置全部正常(彩色品牌图标)。

当前代码处于 01 终局回退态:`src/newtab/index.html` 无 favicon 声明,Edge 无页面
favicon 可取 → 标签空白;地址栏回退 manifest 图标 → 单色遮罩成纯黑。

## Why(站在 01 的结论上)

01 号 issue 已实测确证的机制(不重复验证,直接继承):

1. Edge 把新标签页标签图标**重绘为主题单色**(favicon 笔迹色 = 主题文字色),彩色不可得;
2. Chrome 按页面 favicon 渲染 NTP 标签图标(静态 link 指什么显示什么),并非只用 manifest;
3. 彩色品牌图标近实心(32px 版 98% 不透明)→ 单色剪影 = 实心块,白色瓷砖描边全丢;
4. 垂直标签页疑从 Edge 自身 favicon 库按 URL 取图,chrome-extension:// 无记录,扩展侧大概率无法影响。

01 验证过的可行方案(静态彩色图 + Edge 分支换品牌构图单色图)当时因三点关单:
开场闪黑(模块时换图晚于 favicon 首取)、图标形态存异(不可避免,Edge 单色化所致)、
垂直标签页仍空白(4,大概率无解)。

## Fix

- `index.html` 静态声明 `<link rel="icon" href="/icons/icon-32.png">`(与 manifest 同像素 → Chrome 视觉零变化);
- **新增 `public/newtab-favicon.js`:head 内同步经典脚本**(在 `<link>` 之后),UA 含 `Edg/` → 立刻把 href 换成 `/icons/tab-32.png`。同步脚本先于浏览器 favicon 抓取执行 → **消灭 01 的开场闪黑**;
- `scripts/generate-icons.mjs` 新增 `renderTabMark`:外圈圆角方块轮廓 + 2×2 实心圆角小格(品牌瓷砖几何的单色友好形),透明底中性灰 `#5f6368`,输出 `tab-32.png` 并同步 `public/icons/`(经 public 落 `dist/icons/` 供运行时引用)。

UA 分支失败模式:Edge 被误判为 Chrome → 保留彩色图 → 单色实心块(≈ 01 症状,可辨认降级);Chrome 被误判 → 不换图,彩色不变,零影响。

## 验收

- [x] 单测 newtabFavicon.test.ts:Edge UA → href 换 tab-32;Chrome UA → 不动;无 link → 安全返回;index.html 含静态声明且脚本在 link 之后
- [x] `npm run build` 产物:dist HTML 含 link + 同步 script;dist/icons/tab-32.png 存在(vite 把静态 link 指纹化为 /assets/icon-32-*.png,实测与 icons/icon-32.png 字节一致,Chrome 渲染像素不变)
- [x] typecheck / eslint / vitest 全绿(543 例)
- [ ] 真机 Edge:水平标签图标 = 主题色品牌构图图(非空白非黑块);地址栏图标同形;垂直标签页观察(预期仍空白,属浏览器限制)

## Comments

- 2026-11-04 立单:症状与 01 不同(空白 vs 黑块),Edge 对无声明 favicon 的行为从「回退 manifest 并遮罩」变为「空白」。方案 = 01 验证过的架构 + 同步脚本消灭闪黑。
- 2026-11-04 实现:`scripts/generate-icons.mjs` 新增 `renderTabMark`(外圈圆角轮廓 + 2×2 实心格,透明底 #5f6368,覆盖率 ~40%)出 `tab-32.png` 并同步 `public/icons/`;`index.html` 声明彩色 link + 紧随的经典同步脚本 `public/newtab-favicon.js`(UA 含 `Edg/` → href 换 `/icons/tab-32.png`)。同步脚本先于 favicon 建取执行 → 01 的开场闪黑从机制上消除;UA 分支失败模式:Edge 误判 → 保留彩图(剪影实心块,降级可辨认),Chrome 误判 → 不换图零影响。构建后 link 被 vite 指纹化(与 manifest 图字节一致),tab-32 经 public/ 落 dist/icons/ 原位路径供运行时引用。
- 2026-11-04 一轮真机(像素级 ASCII 转储核验):水平+垂直标签均出图形、无闪黑 ✓,但字形是「外环+顶部横杠+一排 4 点」而非我们的「外环+2×2 实心格」;笔迹色 43,43,43 ≈ 主题文字色(01 实测 46,42,39 同源,重绘口径一致)。逐候选对质(当前 tab-32、icon-32 遮罩、outline-32)均不匹配 → **新事实:Edge 的 favicon 库按 URL 缓存页面图标且跨扩展重载持久**——`/icons/tab-32.png` 与 11-02 二轮构建同路径,Edge 直接吃了当时旧构图的缓存,新像素根本没被取过。另:垂直标签页与水平标签同源跟页面 favicon(01 结论 4「大概率无法影响」翻案)。修复:换图 URL 加版本参数 `?v=2` 破缓存(像素变更时须同步 bump,已写入脚本头部注释)。待二轮真机复验。
- 2026-11-04 二轮真机:`?v=2` 破缓存无效,字形不变。官方文档定位根因:[微软故障排除文档(2026-10 更新)](https://learn.microsoft.com/zh-cn/troubleshoot/microsoft-edge/security/site-icons-change-new-tab-page) 披露 Edge favicon 查找顺序 = ①页面 URL 精确缓存 → ②**主机级缓存回退**(同主机任一页面的缓存图标)→ ③图标服务 → ④首字母;结合 Chromium 源码(`icon_mapping` 按页面 URL 键控、`favicon_bitmaps.last_updated` 过期、重载时 `SetFaviconOutOfDateForPage`)结论:**Edge 标签图标读本地 Favicons 数据库,不实时跟页面 `<link>` 声明;改声明 URL(含 query)不动「页面 URL→图标」映射**。当前显示的旧字形 = 库里早期试验轮次写入的残影(01 二轮「被认成扩展按钮图标」的性象同源——当时看到的也是缓存残影,非当轮构建的图)。
- 2026-11-04 终局(用户决定):**撤销全部修改,wontfix,用户另寻他法**。代码已还原(generate-icons.mjs / index.html / eslint.config.js 恢复;tab-32、newtab-favicon.js、单测已删),dist 重建无 favicon 接线,40 文件 538 测试全绿。注意:Edge 的 Favicons 库已被试验轮次污染——回退后 Edge 标签可能仍显示旧字形残影,彻底清掉需删 `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default` 下 `Favicons` 与 `Favicons-journal`(完全退出 Edge 后删,官方文档步骤;副作用仅书签图标短暂回字母占位)。

  留给未来约结论(若重试,从这里起步):
  1. **先清 Edge Favicons 库再验证**(上述删除步骤或清「缓存的图像和文件」),否则一切观察都是残影。硬刷新(Ctrl+Shift+R)按源码会标记过期重取,值得一试。
  2. 库干净后,本轮已验证可用的架构:静态彩色 link(Chrome 零变化)+ head 同步经典脚本 UA 分支换 tab-32(无闪黑;脚本须在 link 后、勿改 type=module)。实现曾全部落地,见本 issue 上面 Comments 与 01 结论 3。
  3. Edge 主机级回退的存在意味着:同主机(chrome-extension://<id>)任一页面写入库的图标都可能被 NTP 标签拿去用——扩展内所有页面的 favicon 声明要口径一致。
  4. 垂直标签页与水平标签同源跟页面 favicon(01 结论 4 翻案),favicon 修好则两处同好。
  5. 2026-06 起 Edge v149+ 有 favicon 子系统损坏的社区报告([techcommunity](https://techcommunity.microsoft.com/discussions/edgeinsiderdiscussions/favicons-for-bookmarks-broken-since-edge-v149-update/4525940)),本问题可能与之同源,值得跟踪后续版本。
