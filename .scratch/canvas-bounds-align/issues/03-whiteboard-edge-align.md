# 03 白板边缘可见 + 右缘调宽 + 拖中对齐辅助线

Status: done

Blocked by: 02

## 问题

画布边缘不可见(用户反馈 2);拖拽先逃逸后弹回(反馈 1 根因观感);无对齐参考(反馈 3)。

## 方案

- **边缘可见**:白板模式(非锁定态)画布虚线描边 + 16px 点阵底纹;日常态不变。
- **右缘拖柄**:`.wb-resize` 整高条(ew-resize),pointer 拖动实时预览宽度
  (`data-wb-resizing` 态宽随指针),松手 16px 吸附 + clampCanvasWidth 后
  `onResizeCanvas(width)` 写回;pointercancel 只清预览。拖柄带键盘支持
  (←/→ ±16)。搜索/日常态不渲染。
- **拖中钳界**:分组拖拽会话 x 压 `[0, W−CARD_W]`(floor 整 px),不再逃逸画布。
- **对齐辅助线**:move 中用 placements+heights 组 others 矩形,调 `snapAlignment`;
  命中轴写对齐坐标、渲染 `.wb-guide-x/y` 辅助线(画布边线类贯穿整幅);
  松手对已对齐轴跳过网格吸附(对象吸附优先),写回精确对齐坐标。
- **自动滚动**:拖分组/调宽中,rAF 循环检测指针贴近 `.whiteboard-scroll` 左右内缘
  (36px 区)即按距离比例滚动;会话结束停。
- App 接线:`handleResizeCanvas` → `store.setCanvasWidth`;工具行提示语补「拖右缘调整宽度」。

## 验收

- Whiteboard.test.tsx:拖中钳界(右拖不越 810)、对齐吸附写精确坐标 + 辅助线出现/消失、
  拖柄调宽预览与写回、锁定态无拖柄、cancel 清场;既有用例除「右界透传」
  (行为有意变更:拖中已钳,送出值 ≤ 钳界吸附值)外全绿。
- CSS 深浅色随 --fg/--bg 自适;真实浏览器烟测三场景。

## Comments

- 2026-11-04 完成。落地:
  - 边缘可见:白板模式(非锁定)画布虚线描边 + 16px 点阵底纹(=吸附网格暗示)
  - 右缘拖柄 `.wb-resize`(separator 角色、←/→ ±16 键盘步进、aria-valuemin/max)拖动实时
    预览 + `data-wb-resizing` + 宽度读数徽章;松手 16px 吸附 → `onResizeCanvas` → store
  - 拖中钳界:x ≤ W−CARD_W(实测:指针拖出右缘 600px,卡停在 810.67 不动 + 右缘贯穿辅助线)
  - 对齐辅助线:`.wb-guide-x/y`(卡片线 = 并集跨度,画布线贯穿整幅);对齐轴松手跳网格吸附
    (806 → 精确 810 而非格点 816,实测)
  - 松手不闪回:拖拽位/调宽宽保留到持久状态回流再清(dropPendingRef/canvasOverride 哨兵,
    哨兵容忍右界钳回等价值);调宽不进自动滚动(实测教训:自动滚动滚飞预览宽)
  - 自动滚动:仅分组拖拽;rAF 循环贴缘滚动,滚动后用最新指针重算跟手坐标
  - 测试:Whiteboard.test 30 例(含钳界/对齐/调宽/键盘/cancel/不闪回/钳回等价结算),全量 313 绿
  - 真实浏览器烟测(Windows Chrome + preview harness):对齐吸附、右缘钳界+辅助线、
    调宽预览/吸附/键盘、缩宽 720 越界分组重钳(330.67)、控制台零新增报错
