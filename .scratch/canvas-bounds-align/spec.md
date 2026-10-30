# 画布边界:可见、可调、拖拽对齐

Status: done

## 背景(用户反馈三连)

1. 分组卡往右拖,距「右侧边缘还有好大一块距离」就拖不过去,松手弹回原位。
   根因:画布固定 1200px(`CANVAS_W` 常量),页面容器上限 1760px,画布边缘**完全不可见**;
   松手后 `clampToCanvas` 把 x 钳回 ≤ `CANVAS_W − CARD_W ≈ 810.67`。用户看到的空地是画布外的
   页面空白,在一面看不见的墙上弹回。拖中其实不钳(x 只压非负),先跟手逃逸再弹回,观感更迷惑。
2. 编辑(白板)模式下希望明确看到白板边缘,并调整白板范围。
3. 拖动时希望有对齐辅助线:告诉我哪几个板块对齐了(Figma/Miro 式)。

三个问题一体:边缘不可见 → 不能拖过去 → 更没有对齐参考。

## 决策

- **画布宽度入库(schema v3→v4)**:`BookmarkState.canvasWidth`,默认 1200,钳回
  `[MIN_CANVAS_W=720, MAX_CANVAS_W=2400]`。放状态而非设置:分组 x 坐标只有相对画布宽才有
  意义,JSON 备份 replace 导入必须携带宽度,否则换机恢复时坐标被按 1200 钳毁。
- **卡宽不变**:`CARD_W ≈ 389.33` 仍是全局常量(可读性由卡宽定,不随画布拉伸);
  装箱列数随宽度自适应 `columnsFor(width)`,自动整理在宽画布排更多列。
- **拖中实时钳在画布内**(x ≤ W−CARD_W):不再先逃逸后弹回;配合边缘可见,钳回可预期。
- **边缘可见 + 右缘拖柄**:白板模式画布描边(虚线)+ 点阵底纹;右缘整高拖柄,
  拖动实时预览宽度(松手 16px 吸附、钳回界限后经 `store.setCanvasWidth` 写回,
  缩宽时越界分组坐标由 store 重钳)。搜索过滤态与日常态不出拖柄。
- **对齐辅助线**:拖中比较被拖卡与其余卡的 左/中/右(x)与 上/中/下(y)边线,
  外加画布 左/中/右(x)与上(y)边线;阈值 8px 内吸附到精确对齐并显示辅助线
  (贯穿对齐集合的并集跨度;画布边线类贯穿整幅)。已对齐的轴松手不做网格吸附
  (对象吸附优先于网格,同主流设计工具口径)。
- **宽画布拖拽自动滚动**:画布宽于视口时,拖分组/调宽中指针贴近滚动壳边缘自动滚
  (rAF 循环),否则右缘拖柄在 2400px 画布上永远够不着。

## 工单

- `issues/01-canvas-width-geometry.md` — 领域几何宽参数化 + snapAlignment 纯函数(TDD)
- `issues/02-canvas-width-schema.md` — schema v4 入库、迁移、store 动作、导入导出
- `issues/03-whiteboard-edge-align.md` — 白板边缘可见、右缘调宽、拖中钳界、对齐辅助线、自动滚动

## 影响面

`src/domain/canvas.ts`(宽参数化 + snapAlignment)、`types.ts`/`migrations.ts`/`store.ts`/
`importExport.ts`(v4)、`src/newtab/Whiteboard.tsx`/`App.tsx`/`index.css`(UI)、
GLOSSARY「画布」词条、ADR-0004 补记。
