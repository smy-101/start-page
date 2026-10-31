# 01-domain:canvas 待办宽档位数学 + TodoCard 类型扩展

Status: done

## 事

canvas.ts 新增待办卡宽档位纯数学(与组宽档位同域不同数,见 spec 决定 1):

- `MAX_TODO_SPAN = 6`(与组宽档位同上限)
- `todoSpanOf(todo: { span?: number }): number`——合法档位或 1(非法归 1)
- `todoWidthOf(span): number`——`CARD_W + (k−1) × (CELL_W + CELL_GAP)`,
  非法归 `todoWidthOf(1)` = CARD_W(不取整:CARD_W 本身 389.33,渲染宽
  由组件直接消费,取整会造成档 1 与存量 389.33 渲染不一致)
- `nearestTodoSpan(widthPx): number`——最近档位(同 nearestGroupSpan 形状)
- `maxTodoSpanForCanvas(canvasW): number`——放得下的最大档(同形状)

types.ts:`TodoCard` 增 `span?: number`(档位,缺省 1)、`color?: string`
(缺省 = 中性);文档注释同步(「定宽 CARD_W」表述退役)。

## 验收

- src/domain/canvas.test.ts 补:六档宽真值、缺省/非法归 1、nearest 双向
  吸附、maxTodoSpanForCanvas 边界(档宽恰等于画布宽)。
- 取整规范:纯数学无取整(见 CODING_STANDARDS「取整」——本组函数不产坐标)。

## Comments

- 2026-11-14 调校:用户反馈最大宽度过大(初版 6 档 +190 步距,最大 1339px)。
  上限收窄 6→5、步距减半为半格步距 95px,新阶梯 389/484/579/674/769px
  (最大 ≈ 两倍缺省宽)。`MAX_TODO_SPAN`/`todoWidthOf` 单点改,真值表与
  spec/ADR/GLOSSARY 同步;迁移修复上限随常量自动收紧(特性未发布,无存量 6 档)。

## Comments

- 2026-11-14 二次调校(定案):用户不要档位制、且最小 389 偏宽——档位数学
  全部退役(todoSpanOf/todoWidthOf(span)/nearestTodoSpan/maxTodoSpanForCanvas/
  MAX_TODO_SPAN),换自由宽 `TODO_W_MIN=240 / TODO_W_MAX=768 / clampTodoWidth /
todoWidthOf({width})`。TodoCard.span → width(px),SCHEMA_VERSION 10,
  v9 档位按档案数学 `legacySpanWidth`(floor(CARD_W + (k−1)×95))换算。
