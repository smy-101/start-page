# 01 组内收藏排序拖拽收敛为深 module:useCardDnD

Status: done
Type: task

来源:improve-codebase-architecture 走查(2026-10-30,候选 1,Strong)+
grilling 两轮共识。App.tsx 是近 40 次提交的最大热点(18 次),其中最大的
复杂度块是拖拽插入几何(App.tsx L219–372,~150 行)——纯函数抽走了,
真 bug(调用时机与状态新旧)留在组件里,没有 locality;7 个回调
(DragHandlers)穿过 Whiteboard → GroupSection → BookmarkCard 三层透传,
interface 与 implementation 几乎 1:1(浅)。

## Interface(调用者要知道的全部)

- `const { dropHint, handlers } = useCardDnD(bookmarks, onMove)`
  - `dropHint: DropHint` 高频值出口(指示线渲染用)
  - `handlers: DragHandlers` 引用稳定出口(三层透传用),两出口分开:
    只关心 handlers 的层不随指示线重渲染
- `onMove(id: BookmarkId, groupId: GroupId, index: number): void`
  镜像 moveBookmark 三参,fire-and-forget;调用方**无须** useCallback
  (hook 内部 ref 镜像最新值;「必须稳定」不成为调用者义务)
- 组件侧:单个 `handlers: DragHandlers` 对象 prop 直通
  Whiteboard → GroupSection → BookmarkCard,7 条回调线 → 1 条

## Implementation(收进模块、从 interface 消失的)

- 新文件 `src/newtab/useCardDnD.ts`;`dragTypes.ts` 的类型定义并入后
  该文件退役
- `drag` state 降级为模块内部 ref(事实:App JSX 只消费 dropHint,
  L696;App 少 1 个 state + dragRef 镜像)
- 搬入 App.tsx 的:`cardInsertionIndex` / `appendIndex` / `hintAt` /
  `handleSectionDrop` / `handleCardDrop` / `allowDrop` /
  `markDragSource` / `dragHandlers` useMemo 全部
- bookmarks 参数进、内部 ref 随每次 render 刷新;**不订阅 store**;
  hook 对 `Result` 错误模式零知识(错误翻译留 App 的 `run()`:
  成功刷新 / 失败中文文案)
- App 侧供给 `onMove = (id, g, i) => void run(() => store.moveBookmark(id, g, i))`
- 删除 GroupSection 的 `Omit<DragHandlers, "onBoardDragLeave">` 与
  BookmarkCard 的 4 回调子集类型,统一接整束 `handlers`
  (未消费成员惰性无害;memo 比较从 7 个函数引用 → 1 个对象引用)
- 范围仅 HTML5 DnD 收藏排序(组内 + 跨组);白板模式的画布 Pointer
  分组拖拽(Whiteboard 的 DragPos 体系)不在本票,一行不动

## 护栏

- **行为冻结**:纯 deepening;既有测试(DropHint / GroupManagement /
  WhiteboardMode / Whiteboard / memo.contract)断言零改,仅允许最小
  接线改动(props 形状);发现行为疑点记入本文件 Comments,不动手
- ADR-0004 只约束门禁与入口,本票不动门禁

## 测试(本票新增)

- `src/newtab/useCardDnD.test.tsx`,`renderHook` 直测:
  - 插入槽位三情形:悬停被拖项自身(前后=原位)/ 悬停目标上·下半 /
    搜索过滤视图(落点按完整状态算)
  - 指示线去抖:相同槽位保对象引用(memo 契约的根)
  - onMove / bookmarks 不稳定身份不破坏行为(内部 ref 镜像契约)
- 组件层测试退位为集成安全网
- 驱动方式:/tdd——先红(几何直测)后绿(hook 抽取),最后接线

## 验收

- 全部既有断言零改通过
- App 拖拽相关 state 2 个 + ref 4 个 → 0(全部模块内部化)
- Whiteboard / GroupSection / BookmarkCard 拖拽 props:6/6/4 条回调 →
  各 1 个 `handlers` 对象 prop
- `dragTypes.ts` 删除;`grep -r cardInsertionIndex src/` 仅命中
  useCardDnD.ts 内部

## Comments

### 2026-10-30 实现(/implement,/tdd 驱动)

已实现并全量回归通过(420 测试零改断言、typecheck/lint/build 净)。接线仅改
props 形状:Whiteboard/GroupSection/BookmarkCard 各收单 `handlers` 对象
prop;Whiteboard.test 与 memo.contract.test 同步换接线,断言零改。
新增 `src/newtab/useCardDnD.test.tsx`(18 例,renderHook 直测)。真值来源:
抽取前在 App 上的实测探针(已删),数值逐一对应。

**行为疑点(行为冻结未动,待人裁定)**:悬停被拖项自身下半时,
`cardInsertionIndex` 返回全量坐标 `p+1`,而 `hintAt` 把它当 siblings 坐标
再加 1,指示线落在渲染槽 `p+2`(例:拖甲悬甲下半,指示线落在乙之后)
而非注释声称的「贴自身后」`p+1`。上半(槽 p)正确;自悬松手本就无操作,
落位不受影响,仅指示线位置偏一格。修法为自悬分支返回 siblings 坐标
(或 hintAt 识别自悬),一行改动 + 一条直测;如确认修,另开小票。
