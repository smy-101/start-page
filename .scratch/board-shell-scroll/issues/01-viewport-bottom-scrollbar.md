# 01 白板滚动条贴页面底缘(应用壳布局)

Status: done

## 问题

用户反馈:白板过长(画布内容高、或钉宽后宽于视口)时,滚动条显示在
**白板元素下方**,期望在**页面底部**(视口底缘)。

根因:`.whiteboard-scroll` 只有 `overflow-x: auto` 且高度不限——画布
多高它长多高,横向滚动条渲染在白板自身底边;纵向滚动则发生在 body
(页面级文档流滚动)。两种滚动条都不在视口边缘:横向条悬在白板下方
(内容高时要先把整页滚到底才够得着),与「起始页/看板」的应用形态
不符。

## 方案

看板视图改应用壳(app shell)布局,滚动全部收进白板滚动壳:

- `.page:has(> .whiteboard)`:`height: 100dvh` + 纵向 flex +
  `padding-bottom: 0`(滚动壳底缘即视口底缘)。
- `.whiteboard`:`flex: 1; min-height: 0` + 自身纵向 flex(传递余高)。
- `.whiteboard-scroll`:`flex: 1; min-height: 0; overflow: auto`
  (原 `overflow-x: auto` 隐式把 y 轴也算成 auto,显式化)。
- 无 `.whiteboard` 的分支不命中:设置页(`.page.settings`)、加载态、
  搜索空态(Whiteboard 早退不渲染 `.whiteboard`)保持文档流原样。

后果(有意为之):页头/搜索行常驻不随看板滚走——起始页语义,搜索
是页面主角;画布钉宽超视口时横向滚动条贴视口底缘常驻可达;内容高时
纵向滚动在滚动壳内,滚动条贴视口右缘。

## 验收

- 真机(静态构建 → Windows HTTP → MCP 断言):
  - 钉宽 2400 态:`.whiteboard-scroll` 底缘 ≈ 视口底;横向滚动条存在
    (scrollWidth > clientWidth);body 不再滚动
    (documentElement.scrollHeight == innerHeight)。
  - 自动宽态:纵向滚动收进滚动壳(scrollHeight > clientHeight),
    body 同样不滚;画布自动宽仍 == 滚动壳 clientWidth(RO 测量口径不变)。
- `npx vitest run`、`npx eslint` 全绿(CSS 改动 jsdom 不可见,类名未动)。

## Comments

- 2025-问颍修(真机断言,视口 2048×1018):
  - 修复前基线(钉宽 2400):docScrollHeight 2162 > 视口(body 滚);
    滚动壳长到内容高 1965,横向滚动条悬在白板底边(距视口底 49px
    = 页面 48px 底衬)。复现用户症状。
  - 修复后钉宽 2400:bodyScrolls false;壳底缘距视口底 0(横向滚动条
    贴页面底);纵向滚动收进壳内(1950 > 854);搜索行常驻 top 82。
  - 修复后自动宽:壳 clientWidth 1985 == 画布宽(RO 测量口径不变,
    canvasFitsShellWidth true);无横向滚动条;壳内 scrollTop 可滚。
  - 白板模式拖拽冒烟:分组卡 0,0 → 95,41(对齐吸附生效、落点持久化
    回流),Pointer 几何链路在新布局下无恙。
  - vitest 41 文件 553 测试全绿;eslint / tsc 干净。
- 备注:preview seed 的钉宽 2400 场景仅临时用于复现,已还原(自动档)。
- 2026-11-03 /code-review 两轴评审(Standards/Spec):票面四条逐一落实,
  无缺失;裁定——
  (1) 硬违规 1 条已修:新增块注释「起始页语义」踩 GLOSSARY「初始页」
  Avoid 列表,改「初始页语义」;
  (2) P2(b) scope creep:票面只写 100dvh,diff 另加 height:100vh 兜底行
  ——裁定保留:对 dvh 之前的 Chromium(88–107)恰是优雅降级回文档流,
  无可观察行为差,记于此。
