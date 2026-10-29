# 02 白板画布 + Pointer 拖拽 + 吸附 + 自动整理

Status: done

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
- 2026-10-29 完成。落地:
  - `Whiteboard.tsx`:固定 1200px 画布 + 横向滚动壳;落点表引用稳定(memo 契约,同 planWall 的 prev 复用);无坐标分组(运行时损坏防御)落画布底部追加位
  - Pointer 拖拽:画布委托 pointerdown(跳过交互控件)→ window move/up/cancel;拖中 `data-drag-active` 关过渡跟手 1:1;松手 16px 吸附后 `onSetGroupPositions` 写回,越右界钳回收口在领域层;pointercancel 只清会话不落点
  - 画布 `onDragStartCapture` 拦组头原生 DnD(捕获阶段,App 侧组拖状态不 latch);收藏卡(.card,含浏览态链接)放行,组内排序 DropHint 照常
  - 自动整理:即时量高(不吃 state 旧账)→ planWall 装箱 floor 取整;零高(测不出/jsdom)退化 `spreadPositions` —— 与 v2→v3 迁移聚拢共用(canvas.ts,code-review 01 遗留落地)
  - `store.setGroupPositions`:批量写回,clampToCanvas 钳回、未知 id 整批拒绝、无变化不落盘;拖拽单条与整理整批共用一入口
  - App 增 `boardView` 注入缝(BoardViewProps = 墙 props + onSetGroupPositions),默认墙行为不变;`GroupSection` 增可选 `dragActive`;CSS 白板段(grab/grabbing、拖影、自动整理钮);preview `?variant=whiteboard` 宿主可选;`useGroupedBookmarks` 抽出共享(墙/白板)
  - 测试:`Whiteboard.test.tsx` 12 例(吸附/右界透传/交互控件放行/cancel 清场/装箱两路/新组落位/画布高/搜索空态/编辑控件/DnD 分流),全量 269 绿 + typecheck 过;真实浏览器烟测(Windows Chrome + preview):拖拽吸附 (320,496)、持久化、画布高随内容 406→697、自动整理按实测高度装箱、默认宿主墙无回归、控制台零报错

## Comments

- 2026-10-29 code-review(01)遗留:`migrations.ts` 的三列轮流装箱与 `wallLayout.ts` `planWall` 零高退化同形(分层故未共用:领域层不 import newtab)。本票把 planWall 降级为「自动整理」算法时,应在纯模块聚拢一份零高装箱策略供两侧共用。
