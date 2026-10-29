# 04 墙体退役 + 行为回归 + perf 复测

Status: done

Blocked by: 02, 03

## 问题

白板正式接管排版后,瀑布流墙的壳退役;行为面(搜索/折叠/懒挂载/perf)回归收口。

## 方案

- 拆:`BookmarkGroups` 的测高/RO 墙壳与 `useWallLayout`;`planWall/wallColumnCount` 保留(自动整理 + 迁移共用),文件更名或留注均可;墙相关 CSS(`.groups-wall`)清理
- DropHint 体系判定:组内收藏排序仍用 HTML5 DnD + 插入指示(白板内),保留;组间换位的 DnD 分支删除
- 行为回归:搜索过滤态、折叠、懒挂载(10b 的 recorded 语义)、FreshImportCta 在白板下照常;改写受影响测试
- perf:perf-probe 复测首屏(ADR-0002 条款;挂载量不变,墙 RO → 画布 RO,预期持平);超预算 1.5× 走 ADR-0002 升级条款
- ADR-0003 superseded 注记已加(随本票入库);README 截图/描述更新为白板

## 验收

- 全量 `npm test`、typecheck 绿;死代码零残留(grep 验证)
- perf-probe 数字记录进本票 Comments;README 更新
- 手工烟测:全新安装 → 导入 → 白板整理 → 刷新还原

## Comments

- 2026-10-29 立票。
- 2026-10-30 交付:
  - **墙壳退役**:`BookmarkGroups.tsx`(测高/RO 墙壳 + useWallLayout)删除,白板成为 App 唯一看板视图(boardView 注入缝随之拆除,preview `?variant=` 宿主选择移除);`.groups-wall` 与墙时代 CSS(组拖拽淡化、drag-grip 把手、组头 draggable 光标)清理;`probe-styles.mjs`(墙时代样式探针,无引用)删除
  - **装箱算法归位**:`planWall` 移入 `domain/canvas.ts` 更名 `packCanvas`(零高退化内聚、常量折叠、floor int 输出),`wallLayout.ts` 删除;`wallColumnCount` 随唯一消费者(墙壳)退役删除;`WallPlacement`→`CanvasPos` 统一坐标词汇(卡宽由 CARD_W 常量供给,不再随落点对象旅行)
  - **拖拽体系收口**:DragHandlers/DropHint 移至新 `dragTypes.ts`;组间换位 DnD 分支删除(Drag 去 group 变体、onGroupDragStart、GroupHeader draggable/把手/GripIcon);`onWallDragLeave`→`onBoardDragLeave` 挂 `.whiteboard-scroll`(指示线清场行为平移,DropHint 测试锁死)
  - **行为回归**:搜索过滤/折叠(10b recorded 语义)/FreshImportCta 在白板宿主下照常——受影响测试改写(WhiteboardMode 默认宿主翻转为白板、DropHint、FreshImportCta `.whiteboard-canvas`、GroupManagement 组间换位改断言「拖不起不换位」);全量 271 绿 + typecheck 0 错;grep 死代码零残留
  - README「看板与分组管理」段重写为白板口径(画布/白板模式/日常态锁拖与 nudge/自动整理);ADR-0003 superseded 注记随本票入库并补 planWall→packCanvas 现名
- 2026-10-30 perf 复测(5000 条,Windows Chrome 156,防节流旗标,扩展置于 Windows 本地路径):
  - 首屏 cardsDone = **588 / 573 / 548ms**(firstCards 427-452);交互:搜索/清空 ≤2ms、白板模式开关 ≤1ms、添加 126-201ms、删除落定 190-267ms、进出设置 ≤1ms、全量 storage 写 33-100ms——纯 UI 与存储链路全部落预算(ADR-0002:≤100/≤300);首屏超 500 但 <1.5×(750ms),**不触发升级条款**
  - 对照归因(A/B,同会话交替全新标签 × 3):墙@HEAD(7b3eb47)634/671/576 vs 白板@本票 651/636/568——**持平**(票面预期「挂载量不变,墙 RO → 画布 RO」成立);绝对值较 ui-refresh 时代(405)同步漂移,墙同样漂,判定为环境因素非白板回归
  - 方法学两坑(均已修复):① 扩展装在 `\\wsl.localhost` UNC 路径时资产 IO 拖慢首屏 ~500ms,必须拷到 `C:\dev`;② perf-probe 每轮对同一标签累积注入 MutationObserver 收集器且不拆除,污染后续轮次(本轮早先 1100-1400ms 假读数即此)——脚本已改为测量毕即 removeScriptToEvaluateOnNewDocument、建标签轮询等待、删除按钮随 board-refresh 图标化改按 aria-label(此前恒 -1)
- 2026-10-30 手工烟测(真实扩展,Windows Chrome,CDP 可信输入,截图 `shots/04-smoke-*.png`):全新安装引导可见 → 一键原生书签导入(新增 4 条、4 分组、引导消失)→ 进白板拖拽分组 (0,192)→(208,320) 精确 16px 吸附 → 自动整理贪心装箱 3 列+第二行 → 刷新后坐标逐字还原;控制台零错误
- 2026-10-30 code-review(两轴并行):Standards 0 硬伤 + 4 P2、Spec 无缺失/无错误 + 1 P2,全部处置——`.edit-toggle`→`.whiteboard-toggle`(GLOSSARY 对齐,App/CSS/perf-probe/diag-shot)、App 内两处追加下标同形提取 `appendIndex`、ADR-0003/0004 补记 planWall→packCanvas 现名、dragTypes 头注补票号、测试残留 `wall` 变量名更正。
