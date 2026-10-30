# 组宽与每行条数解耦(group-span-decouple)

Status: done
用户诉求(group-width-tint 落地后反馈,2026-12):

把组拖宽后,在组头表单把「每行条数」改成一列一条,保存后组缩回了
单列基准宽。期望:**拖出来的组宽保持住**,「每行条数」只是组内排版。

## 定案(grilling 两问)

- **宽组 + 一行一条的形态**:每条收藏拉满整行(清单式观感,1fr 拉伸;
  「条目保持原宽、右侧留白」弃)。
- **拖窄到装不下当前每行条数**:每行条数自动跟着降(条目始终装满组宽;
  「锁住下限拖不下去」弃)。

## 模型(schema v7)

- `Group.span?: number`,**组宽档位**(1–6 整数):组宽 = `groupWidthOf(span)`,
  仍是档位推导不存 px。缺省 = 从 columns 推导(装满)。
- `Group.columns` 含义不变(**每行条数**),新增约束 columns ≤ span(写路径
  保证);缺省 = 每行条数随档位装满。
- 推导:`spanEff = span ?? columns ?? 1`;每行条数 `= columns ?? spanEff`。
- 组合语义表:

  | (span, columns) | 组宽 | 每行 | 观感 |
  |---|---|---|---|
  | (–, –) | W(1) | 1 | 默认单列宽行 |
  | (–, 4) | W(4) | 4 | v6 全部存量,逐字不变 |
  | (4, –) | W(4) | 4 | 拖宽过、未动表单(装满)|
  | (4, 1) | W(4) | 1 | **宽组清单式(本诉求)** |

- **迁移 v6→v7 零数据改写**:缺省推导已覆盖 v6 全部状态,仅升版本号;
  防御修复:span 非法(非整数/越 1..6)剥离;columns > span 时 span 抬到
  columns(宽到装得下,不丢用户排版)。
- 导入:`isGroupShape` 放行可选 span(给了必须是数字);`restoreFrom`
  按画布钳 span、连带钳 columns ≤ span、按组宽钳 x。

## 写路径(store)

- `setGroupSpan(id, span)`(新,拖柄/键盘):span 钳
  [1, min(6, maxSpanForCanvas(界宽))];columns 存在且 > span 时自动降
  (=span;缺省保持装满);变宽后按新宽重钳 x;同义不落盘。
- `setGroupColumns(id, columns)`(表单,语义升级):cells 钳同上;
  **span' = max(spanEff, cells)——只升不降**(表单永不缩宽);span'
  ≠ 原 spanEff 时物化写入;变宽重钳 x;同义不落盘。
- `setCanvasWidth` 缩宽:逐组 span = min(spanEff, maxSpanForCanvas)、
  columns = min(columns, span),按各自宽重钳 x。
- `setGroupPositions`:x 按各组 spanEff 宽钳界;`statesEqual` 纳入 span。

## 几何(canvas.ts)

- `groupSpanOf(group)`、`groupCellsOf(group)` 新增;
  `nearestGroupColumns` → `nearestGroupSpan`(拖柄吸附目标 = 档位);
  `maxColumnsForCanvas` → `maxSpanForCanvas`(钳上界 = 档位上界);
  `groupWidthOf`/`MAX_GROUP_COLUMNS`/`CELL_*` 不变。

## UI

- GroupSection:渲染宽 = `groupWidthOf(groupSpanOf)`;拖柄松手吸附档位、
  写 `setGroupSpan`;键盘 ←/→ 步进档位;哨兵盯 span 回流(快照含
  columns,偏离即解除本地宽,同 v6 口径);徽标「宽 N 列」,cells < span
  时附「· 一行 M 条」;aria-valuenow = span,title「拖动调整组宽」。
- GroupHeader 表单:「每行条数」下拉保留(1–6),保存走 setGroupColumns
  (组宽只升不降);收集箱不变。
- Whiteboard:widthOf/钳界/对齐/装箱全部按 spanEff 宽;`resizeMaxColumns`
  改供 maxSpanForCanvas。
- CSS:`.group-grid` 模板由组件按 `groupCellsOf` 注入
  `repeat(c, minmax(184px, 1fr))`(c < span 时条目拉满整行;c = span 与
  现状 auto-fill 等价);CSS 里 auto-fill 保留为缺省兜底。

## 收集箱

无表单 → 拖宽即装满,行为与 v6 逐字一致。

## 工单

- `issues/01-domain-span.md` schema v7 + 几何 + 迁移 + store + 导入导出
- `issues/02-ui-span.md` 拖柄/表单/徽标/CSS + 组件测试 + 文档收尾

## 文档收尾

- GLOSSARY:「每行条数」改写(不再推导组宽);新增「组宽档位」;
  「画布」口径同步(schema v7)。
- ADR-0005:组宽与每行条数解耦(v6「组宽由每行条数推导」决策反转的
  记录:用户心智「长度是长度、排版是排版」+ 定案两条)。
- types.ts SCHEMA_VERSION 注释补 v7 行。

## Comments
- 2026-12 实现:两票落地,tsc/eslint 干净,399 测试全绿。v6→v7 零改写
  迁移经引用相等锁定;回归用例覆盖「表单一行 1 条不缩宽」(含 v6 存量
  columns-only 路径)与「拖窄自动降条数」;preview 种子新增清单式样例组。
