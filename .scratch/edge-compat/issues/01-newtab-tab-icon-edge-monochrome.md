# 01 — 初始页标签图标在 Edge 显示为纯黑

**Status:** wontfix
**Labels:** bug, edge-compat

## What happened

用户报告:在 Edge 上使用初曦时,标签栏上初始页那个标签的图标显示为纯黑色;Chrome 上正常(晨曦渐变彩色)。

## Why(根因,有据可查)

- Edge 对「扩展接管的新标签页」的标签图标做**单色遮罩渲染**(取图标 alpha 剪影填充主题单色),这是 Edge 侧行为,非本扩展 bug:
  - [MicrosoftEdge-Extensions Discussion #94](https://github.com/microsoft/MicrosoftEdge-Extensions/discussions/94)(2023):NTP 扩展的标签图标一律黑白遮罩,仅 Edge 如此,作者实测"any icon used in the manifest will be masked out"。
  - [V2EX t/1132070](https://www.v2ex.com/t/1132070)(2025-05):同症状「icon 在 edge 显示成纯黑」,社区解法 = 运行时换 `<link rel="icon">` 的 href 为 Edge 专用图。
- 本扩展品牌图标 `icons/icon-*.png` 为近实心的晨曦渐变圆角方块(32px 版 98% 像素不透明,含白色网格描边),剪影遮罩后 = 一块纯黑,白色描边丢失 → 与用户所见完全吻合。
- `src/newtab/index.html` 未声明 `<link rel="icon">` → Edge 回退 manifest 图标并遮罩;Chrome 忽略页面 favicon、直接用 manifest 图标,所以 Chrome 无恙。

## Fix

1. `index.html` 静态声明彩色 `<link rel="icon" href="/icons/icon-32.png">`(对 Chrome 无感: honored 与否视觉都等于 manifest 32 图标)。
2. 新增 `src/newtab/newtabFavicon.ts`:UA 含 `Edg/` 时把 favicon href 换成 `icons/outline-32.png`——透明底描边图(32px 版仅 36% 覆盖,中性灰 `#5f6368`):遮罩剪影仍是可辨的四格轮廓;若直接渲染,深浅主题下也都可见。`main.tsx` 模块顶层调用。

## 验收

- [x] 单测:Edge UA → href 换描边图;Chrome UA → 不动;无静态声明时补建(newtabFavicon.test.ts,4 例)
- [x] 全量:typecheck / eslint / 542 测试全绿;`npm run build` 产物含静态 link 与 outline-32
- [x] 真机:Edge 装新构建后开新标签,标签图标为可辨图形,不再是纯黑(2026-10-31 用户截图验证:标签内星四格网格描边);扩展菜单处图标同为描边形态,与 Chrome 一致(action.default_icon 设计如此)
- [ ] 三轮:Chrome 图标还原为彩色渐变(与修复前/manifest 同像素);Edge 标签栏为品牌构图单色图(可能开场闪一下彩色图的单色剪迹);垂直标签页仍待观察

## Comments

- 2026-10-31 实现:`src/newtab/newtabFavicon.ts`(UA 含 `Edg/` → favicon 换 `/icons/outline-32.png`)+ `index.html` 静态彩色声明 + `main.tsx` 顶层接线。机制注释在模块头部;构建后静态彩色图被 vite 指纹化进 assets,描边图走 `dist/icons/` 原位路径,两浏览器各自取图。
- 2026-10-31 验证:用户 Edge 真机截图(标签栏红框标注)像素级确认——初曦标签图标已是四格网格描边,不再是实心黑块;扩展菜单卡片图标同为描边形态(action.default_icon,与 Chrome 口径一致)。
- 2026-11-02 二轮(用户反馈两处不满足):①标签栏的描边图被认成「扩展按钮图标」(action.default_icon 同形),要的是初始页品牌图标;②垂直标签页里初始页图标空白。实测截图像素:标签 favicon 笔迹色 ≈ RGB(46,42,39)=主题文字色而非图标本色 #5f6368 → **Edge 对页面 favicon 重绘为主题单色,彩色不可得**(与 Anori #245「无能为力」、Bonjourr #700 遭遇微软 2025-10~2026-07 反复横跳一致)。方案改为品牌构图的单色化:`icons/tab-32.png`(外圈圆角方块轮廓+2×2 实心小方格,几何并入 scripts/generate-icons.mjs 的 renderTabMark,32% 覆盖率,遮罩后仍为 logo 形态),index.html 静态声明、删除 newtabFavicon 模块(无 JS 换图 → 无闪黑)。垂直标签页空白疑为 Edge 面板从 favicon 库按 URL 取图、chrome-extension:// 无记录所致,待真机观察;若无法影响则属浏览器限制。
- 2026-11-02 三轮(用户反馈「Chrome 图标也出问题了」,回退):二轮静态指向灰图暴露新事实——**Chrome 同样按页面 favicon 渲染**(非只用 manifest 图标)。终态架构:index.html 静态彩色 icon-32(与 manifest 同像素 → Chrome 精确还原)+ newtabFavicon 模块恢复(Edge UA → 换 /icons/tab-32.png 品牌构图图;tab-32 经 public/icons 落进 dist/icons 供运行时引用)。已知代价:Edge 上 JS 执行前闪一下彩色图的单色剪迹。
- 2026-11-02 终局(用户决定):**回退到最初状态,wontfix**。代码全部还原(index.html 无 favicon 声明、无 newtabFavicon 模块、无 tab-32 图标),Edge 标签图标回到纯黑块——那是 Edge 对新标签页 favicon/manifest 图标的单色重绘,扩展侧无解。

  留给未来的结论(若重试此问题,从这里起步):
  1. Edge 会把新标签页标签图标重绘为主题单色(实测:favicon 笔迹色 = 主题文字色);彩图剪影即黑块。
  2. Chrome 按页面 favicon 渲染新标签页标签图标(静态 link 指什么它显示什么),并非只用 manifest 图标。
  3. 可行方案已验证过:静态彩色图(Chrome 彩色)+ Edge UA 分支换品牌构图单色图 tab-32(圆角方块轮廓+2×2 实心格,generate-icons.mjs 的 renderTabMark 可重写)。用户对当前形态不满意(图标形态存异、开场闪黑、垂直标签页仍空白),故关单。
  4. 垂直标签页空白:疑为 Edge 面板从自身 favicon 库按 URL 取图,chrome-extension:// 页面无记录,扩展侧大概率无法影响。
