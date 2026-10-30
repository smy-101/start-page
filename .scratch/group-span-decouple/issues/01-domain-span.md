# 01 领域层:组宽档位(schema v7)+ 几何 + 迁移 + store + 导入导出

Status: done
Type: task

`Group.span?: number`(组宽档位,1–6 整数,缺省 = columns 推导);
SCHEMA_VERSION 7;statesEqual 纳入 span。

canvas.ts:新增 `groupSpanOf(group)`(span ?? columns ?? 1,非法归 1)、
`groupCellsOf(group)`(columns ?? span,钳 ≤ span);`nearestGroupColumns`
改名 `nearestGroupSpan`、`maxColumnsForCanvas` 改名 `maxSpanForCanvas`
(语义 = 档位);`groupWidthOf` 数学不动。

store:`setGroupSpan(id, span)` 新增(拖柄路径;钳
[1, min(6, maxSpanForCanvas)];columns > span 自动降 = span,缺省保持
装满;按新宽重钳 x;同义不落盘);`setGroupColumns` 语义升级(表单路径;
span' = max(spanEff, cells) 只升不降,物化条件 span' ≠ 原 spanEff;
变宽重钳 x;同义不落盘);`setCanvasWidth` 缩宽逐组
span = min(spanEff, maxSpan)、columns = min(columns, span) + 重钳 x;
`setGroupPositions` 按各组 spanEff 宽钳界。

migrations v6→v7:零数据改写(仅版本号);防御修复段:span 非法剥离、
columns > span 时 span 抬至 columns;幂等引用保持。

importExport:`isGroupShape` 放行可选 span(数字);`restoreFrom` 按画布
钳 span、columns ≤ span、按组宽钳 x。

验收:几何/迁移/store/导入导出测试全绿;v6 状态迁移后渲染逐字不变
(span 缺省推导覆盖);「表单改每行条数不缩宽」「拖窄自动降每行条数」
在 store 层有用例。

## Comments
