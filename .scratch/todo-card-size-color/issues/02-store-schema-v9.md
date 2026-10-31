# 02-store:schema v9 + 档位/选色写路径 + 钳界联动

Status: done

## 事

Blocked by: 01

- `SCHEMA_VERSION = 9`;迁移 v8→v9 零改写;统一修复:todos 里非法 span
  (非有限/非整数/越 1..6)剥离、非 string color 剥离(幂等,干净引用保留)。
- 接口新增:
  - `setTodoSpan(id, span)`:钳 1..maxTodoSpanForCanvas(canvasBoundWidth),
    非有限值归 1,floor;与生效档位同义不落盘;写则物化 span。
  - `recolorTodo(id, color)`:trim 后空串 = **清回中性**(color: undefined);
    非空串照收(不校验色域,同分组);卡不存在报 todo-not-found。
- `setTodoPositions`:右界钳按 `todoWidthOf(todoSpanOf(t))`(退役定宽
  CARD_W 口径,注释同步)。
- `setCanvasWidth` 缩宽:todos 同 groups 口径——超档降档、x 按新宽重钳;
  未动者原对象保留。
- `statesEqual`:todos 循环补 `x.span !== y.span || x.color !== y.color`。

## 验收

- store.test:两写路径(含空串复位中性、未找到、同义不落盘、钳上界、
  非有限归 1)、setTodoPositions 按档位宽钳右界、setCanvasWidth 降档重钳、
  statesEqual 差异触发。
- migrations.test:v8 备份导入逐字不变(仅版本号升)、非法 span/color
  剥离、幂等。
