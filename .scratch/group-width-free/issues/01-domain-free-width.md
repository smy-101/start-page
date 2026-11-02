# 01 领域层:组自由宽(schema v13)+ 几何 + 迁移 + store + 导入导出

Status: done
Type: task

`Group.width?: number`(自由宽 px,缺省 = 从每行条数推导装满);
SCHEMA_VERSION 13;statesEqual 纳入 width。

canvas.ts:`clampGroupWidth`(铇 [222, 2400],floor,非有限归下界)、
`normalizeGroupWidth`(单一收口:有限铇回/非有限剥离)、`groupCellsForWidth`
(groupWidthOf 的逆,装满推导)、`groupWidthPxOf`(生效宽)、`groupCellsOf`
改随宽推导(宽缺省时条数即推导源不铇);`groupSpanOf`/`nearestGroupSpan`/
`maxSpanForCanvas` 退役。

store:`setGroupWidth` 新增(拖柄路径;铇界 + 不越画布;条数超装满自动降;
重铇 x;同义不落盘);`setGroupColumns` 换轨(表单路径;宽' =
max(生效宽, 装满条数宽) 只升不降,物化宽);`setCanvasWidth` 缩宽收窄到
画布宽 + 条数连带降 + 重铇 x;`setGroupPositions` 按各组生效宽铇界。

migrations v12→v13:span 按旧档位数学换算 px、剥离;无 span 零改写;
终末修复:残遗 span 剥离、非法 width 铇/剥、合法条数装不进铇后宽时抬宽。

importExport:`isGroupShape` 放行可选 width(span 为 v7–v12 遗物同口径放行);
`restoreFrom` width 优先、残遗 span 换算、随画布收窄、缺省组不物化
(推导宽超界时例外收窄物化)。

验收:域层测试全绿;v12 状态迁移后渲染逐字不变;「表单不缩宽」「拖窄
自动降条数」「缩画布收窄」在 store 层有用例。

## Comments

- 实现中发现并修复:终末修复块 `columns` 未从 rest 剥离,非法值被
  `...rest` 原样带回(测试「columns 2.5 剥离」抓到);`groupCellsOf`
  宽缺省时误铇 columns(自洽性用例抓到)。
- 评审收尾(Standards 轴):restoreFrom 越界整数 columns(7/-3)从旧
  `Math.min` 物化改为剥离回装满,渲染等价但无测试钉住——补「越界整数
  columns 备份」用例(「合并旧路径垃圾输入逐字等价…补测试钉住」要求);
  canvas.ts `groupCellsOf` 注释错字铇→钳。
