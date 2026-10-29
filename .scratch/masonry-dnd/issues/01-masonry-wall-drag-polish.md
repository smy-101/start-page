# 看板墙瀑布流 + 拖拽体验优化

**Type:** task
**Status:** done

## What

用户反馈:布局不是瀑布流,上一行有一列高(如收集箱多卡)时,下一行与上一行之间出现空隙;要求调整为瀑布流,并顺带优化拖曳操作。

### 瀑布流(ADR-0003)

- `groups-wall` 从 grid 行对齐改为 JS 测高 + 贪心最短列装箱:纯函数 `wallLayout.ts`(`wallColumnCount` / `planWall`),DOM 顺序保持组间逻辑顺序
- 测量两条腿:`useLayoutEffect` 同步量(首帧不闪)+ `ResizeObserver` 跟踪后续高度/墙宽变化;jsdom 无 RO → 退化均匀铺开,行为测试不受影响
- `planWall` 对未变格子沿用旧对象引用,GroupSection/BookmarkCard 的 memo 契约延续
- 格子绝对定位 + `top/left` 180ms 过渡(宽不参与,缩放跟手);`prefers-reduced-motion` 全局兜底
- 列数规则与原 `minmax(300px, 1fr)` 一致,无视觉宽度变化

### 拖拽优化

- **插入指示线**:拖收藏悬停卡片上/下半 → 插到目标之前/之后(此前只能之前);悬停分区非卡片区(列头/空白)→ 追加末尾;空组也给放置坑位
- **move 光标**:`effectAllowed`/`dropEffect = move`,不再有复制加号歧义
- **拖拽源淡化**:被拖行/被拖列就地 opacity 0.45(dragend 在源元素必发,含放置成功)
- **编辑模式关闭链接原生拖拽**:此前拖卡片实际拖的是 `<a>` 的 URL
- **整墙拖离清指示线**(dragleave + relatedTarget 判定,组间移动误触不清)

## DoD

- [x] 高矮分组混排无行间空隙(真实 Chrome 验证:760px 两列装箱坐标正确,墙高=最高列)
- [x] 既有 227 测试零改动通过;新增 17 个断言(wallLayout 11 + DropHint 6)
- [x] memo 契约延续(planWall 引用复用 + 稳定 elementRef 回调)
- [x] 真实浏览器 HTML5 DnD 链路验证:组内换位(npm→React 前)、跨组移动(虎嗅→前端开发)均按判定落位

## Comments

- 2026-11-07:jsdom 无 `DragEvent` 构造器,`fireEvent.dragOver` 的 `clientY`/`relatedTarget` 会静默丢失;测试改用 `MouseEvent` 构造(dispatch 经 React 委托照常分发)。上半/下半判定在 jsdom(量高 0)退化为「之前」,与旧行为一致。
