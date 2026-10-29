# 看板墙用 JS 瀑布流,不用 CSS 多列/网格

> **[已取代]** ADR-0004(2026-10-29):看板改白板自由定位,拖拽锁进白板模式;
> 本篇的 planWall 装箱降级为「自动整理」算法继续复用(现名 `packCanvas`,
> 随票 board-whiteboard/04 移入 `src/domain/canvas.ts`),墙体测量壳退役。

用户反馈:分组卡高度不一(收藏数不同/折叠态),`grid auto-fill` 的行对齐使上一行最高卡把下一行整体推下去,行间出现空隙;要求瀑布流(逐卡紧贴装箱),顺带优化拖拽。2026-11-06 决定:**分组墙改为 JS 测高 + 贪心最短列装箱**(`src/newtab/wallLayout.ts`),DOM 顺序保持组间逻辑顺序,格子用绝对定位落位。

## Considered Options

- **CSS 多列(`columns`)**:零 JS 即得真瀑布流,但流序是**列优先**(第 2 组排在第 1 组*下方*而非右侧)。分组是用户拖拽排序的实体,「换位」语义跟视觉顺序强耦合,列优先会让"拖到某组之前"的落点反直觉;跨列平衡还会让列高一致但内容错行。
- **CSS Grid masonry(`grid-template-rows: masonry`)**:语义正合适,但 Chrome 稳定版至今未发货(仅实验旗标),MV3 扩展不能依赖。
- **JS 测高 + 贪心装箱(选定)**:纯函数 `planWall`(逐项放当前最矮列,平手取靠前),组件层两条测量腿——挂载/集合变化时 `useLayoutEffect` 同步量(首帧不闪、paint 前纠正),`ResizeObserver` 跟踪后续高度变化(增删收藏/折叠/编辑态);墙宽同由 RO 得出,列数规则与原 `minmax(300px, 1fr)` 一致。

## Consequences

- **可访问性与拖拽语义不变**:DOM/Tab 顺序仍按 `order`,`reorderGroups`/`moveBookmark` 的下标语义原样成立,既有测试零改动通过。
- **memo 契约延续**:`planWall` 对数值未变的格子沿用上次对象引用,位移无关的 GroupSection 不重渲染(jsdom 无 RO、量高恒 0 → 退化为各列首行均匀铺开,行为测试不受影响)。
- 代价:墙高与格子坐标是 JS 状态,极窄/极快缩放依赖 RO 回调节奏;格子 `top/left` 带 180ms 过渡(宽不参与,缩放跟手),`prefers-reduced-motion` 全局条款照旧兜底。
- 拖拽顺带升级:插入指示线(分组色细线,悬停卡片上/下半判定插前/插后,悬停分区空白=追加末尾)、`effectAllowed/dropEffect = move`(光标不再有复制歧义)、拖拽源就地淡化、编辑模式下链接原生拖拽关闭(拖的是卡片而非 URL)、指针拖离整墙清指示线。
