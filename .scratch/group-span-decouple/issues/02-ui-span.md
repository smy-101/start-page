# 02 白板 UI:拖柄调档位 + 表单保宽 + 清单式网格 + 文档

Status: done
Type: task
Blocked by: 01

GroupSection:渲染宽 `groupWidthOf(groupSpanOf(group))`;拖柄松手吸附
`nearestGroupSpan` → `onResizeSpan`(新 prop,App → store.setGroupSpan);
键盘 ←/→ 步进档位;回流哨兵盯 span(快照 {requested, atSpan, atColumns},
偏离即解除本地宽);徽标「宽 N 列」,groupCellsOf < span 时
「宽 N 列 · 一行 M 条」;aria-valuenow = span;title「拖动调整组宽」。

GroupHeader:「每行条数」下拉保留,初值 = groupCellsOf;保存走
onSetColumns(App → store.setGroupColumns)。

Whiteboard:widthOf/拖拽钳界/对齐矩形/装箱/哨兵右界按 spanEff;
`resizeMaxColumns` 改供 maxSpanForCanvas。

CSS:`.group-grid` 由组件注入 `grid-template-columns:
repeat(c, minmax(184px, 1fr))`(c = groupCellsOf;装满时与 auto-fill
等价,c < span 时条目拉满整行);规则内 auto-fill 保留为兜底。

回归用例(GroupManagement/Whiteboard):拖宽到 4 档 → 表单改一行 1 条 →
组宽保持 W(4)、网格 repeat(1);表单选更大每行条数组自动拉宽;
键盘步进/徽标文案;收集箱拖宽仍为装满。

文档:GLOSSARY(每行条数改写、新增组宽档位、画布口径);ADR-0005
(解耦决策,v6 推导决策反转记录);types.ts 版本注释。

验收:组件测试全绿;tsc/eslint 干净;preview 手测三态(默认/装满/清单式)。

## Comments
