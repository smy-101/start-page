# 01 领域几何宽参数化 + 对齐吸附纯函数

Status: done

## 问题

canvas.ts 全部以 `CANVAS_W = 1200` 常量为纲:clampToCanvas、packCanvas、spreadPositions
写死三列。画布宽要可调(spec 决策),且拖拽对齐吸附需要一份无 DOM 的几何纯函数。

## 方案

- 常量:`CANVAS_W` → `DEFAULT_CANVAS_W = 1200`;新增 `MIN_CANVAS_W = 720`、
  `MAX_CANVAS_W = 2400`(均为 16 倍数);`CARD_W` 不变(卡宽不随画布拉伸)。
- `clampCanvasWidth(w)`:钳回 `[MIN, MAX]`,floor 取整(取整口径遵循 CODING_STANDARDS)。
- `columnsFor(w)`:`max(1, floor((w + GAP) / (CARD_W + GAP)))`;1200 → 3、2400 → 5。
- `clampToCanvas(pos, canvasW = DEFAULT_CANVAS_W)`、`packCanvas(heights, canvasW)`、
  `spreadPositions(count, canvasW)` 全部带宽参数,缺省 1200(旧调用点零改动)。
- `snapAlignment(dragged: Rect, others: readonly Rect[], canvasW, threshold = ALIGN_PX)`:
  被拖卡与其余卡 + 画布边线的 9+4 候选线对齐吸附,返回 `{x, y, guides}`
  (x/y 为对齐后坐标或 null;guides 含轴线位置与交叉轴并集跨度,画布边线类贯穿整幅)。
  每轴只取最近一对;对象吸附结果供松手跳过网格吸附用。

## 验收

- canvas.test.ts:宽度钳回、columnsFor 边界、宽参数装箱列数、snapAlignment
  (左对左/中对中/右对画布右缘/无匹配/阈值边界/多卡并集跨度/两轴同吸)全绿。
- 既有测试零改动仍绿(缺省参数兼容)。

## Comments

- 2026-11-04 完成。落地:`CANVAS_W`→`DEFAULT_CANVAS_W`;`clampCanvasWidth`(floor、非有限归默认)、
  `canvasWidthOf`(状态归一)、`columnsFor`(EPS 容差防 1216/405.33 浮点掉列);`spreadPositions`/
  `packCanvas`/`clampToCanvas` 宽参数化(缺省 1200,旧调用零改动);`snapAlignment` +
  `alignRects` + `Rect`/`AlignGuide`/`AlignSnap`(每轴最近一对、等距卡片优先于画布线、
  并集跨度 ±GUIDES_PAD 压回画布)。canvas.test 28 例全绿。
