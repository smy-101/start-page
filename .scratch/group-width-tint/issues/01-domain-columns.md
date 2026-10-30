# 01 领域层:每行条数(schema v6)+ 几何 + 迁移 + store

Status: done
Type: task

`Group.columns?: number`(每行条数,缺省 1);SCHEMA_VERSION 6。
canvas.ts:`CELL_W=184`、`CELL_GAP=6`、`GROUP_EDGE=26`、`MAX_GROUP_COLUMNS=6`、
`groupWidthOf(columns?)`、`nearestGroupColumns(widthPx)`、
`maxColumnsForCanvas(canvasW)`;`clampToCanvas` 加可选 `cardW` 参数
(缺省 CARD_W,旧调用不动);`packCanvas(heights, canvasW, widths?)`
宽度感知装箱(占连续槽、窗口内组顶最高槽最小、组居中;全 1 列时结果
与旧实现逐字一致)。

store:`setGroupColumns(id, columns)`(钳 1..min(6, maxColumnsForCanvas(界宽)),
按新宽重钳 x,无变化不落盘);`setCanvasWidth` 缩宽时超宽组降列 + 按各自
宽重钳 x;`setGroupPositions` 按各自宽钳;`statesEqual` 纳入 columns。
migrations v5→v6:剥离非法 columns(非有限/非整数/越界),不回填。
importExport:`isGroupShape` 放行可选 columns;`restoreFrom` 按组宽钳 x、
超宽降列。preview 种子不动(缺省即单列)。

验收:几何/迁移/store/导入导出测试全绿;存量 v5 状态迁移后引用相等
(幂等不改写)。

## Comments
