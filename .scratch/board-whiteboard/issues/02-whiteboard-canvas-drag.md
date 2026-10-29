# 02 白板画布 + Pointer 拖拽 + 吸附 + 自动整理

Status: ready-for-agent

Blocked by: 01

## 问题

把 `prototype/board-whiteboard` 分支上的白板壳提纯为正式组件:固定画布、Pointer 拖拽、16px 吸附、自动整理。原型是一次性代码,此处 TDD 重写,只借交互口径与踩坑结论。

## 方案

- `src/newtab/Whiteboard.tsx`(正式):渲染壳 = 横向滚动容器 + 1200px 画布 + GroupSection 复用(placement 供 x/y/卡宽,DOM 序仍按 order)
- 拖拽:画布级委托 `pointerdown`(跳过 `a,button,input,select,[contenteditable]`)→ window `pointermove/up`;拖中 `transition: none` + 提升阴影;松手 `Math.round(p/16)*16` 吸附;坐标 clamp ≥0
- 画布 `onDragStart` 全拦(杀组头常开原生 DnD,否则劫持 pointermove——原型实测坑)
- 「自动整理」:量高(挂载 useLayoutEffect 同步 + RO 跟踪)→ planWall 装箱回坐标;首挂载引导两趟(先堆叠量高再装箱,状态机驱动,StrictMode 双调用安全——原型 ref 版翻车,勿重蹈)
- 新分组无坐标 → 画布底部追加;画布高随内容增长
- 本票**不带门禁**:拖拽常时可用(门禁是票 03);App 以 prop 注入白板替换 BookmarkGroups,`editMode` 照旧透传
- preview harness 恢复 `?variant=` 宿主可选;不阻塞

## 验收

- 新 `Whiteboard.test.tsx`:拖拽落点吸附(jsdom 合成 PointerEvent)、自动整理装箱、新分组落位、编辑控件随 editMode
- 既有 EditMode/DropHint 组内拖拽测试不动、全绿
- `npm test`、typecheck 过

## Comments

- 2026-10-29 立票。原型参考:`git checkout prototype/board-whiteboard` → `preview/index.html?variant=C`(免门禁即本票形态)。

## Comments

- 2026-10-29 code-review(01)遗留:`migrations.ts` 的三列轮流装箱与 `wallLayout.ts` `planWall` 零高退化同形(分层故未共用:领域层不 import newtab)。本票把 planWall 降级为「自动整理」算法时,应在纯模块聚拢一份零高装箱策略供两侧共用。
