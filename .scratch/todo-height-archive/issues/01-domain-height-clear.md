# 01-domain:定长字段 + 清除已完成写路径 + schema v11

Status: done

## 事

- `types.ts`:`TodoCard` 增 `height?: number`(px;缺省 undefined = 自适应,
  存量零改写);`SCHEMA_VERSION` 10 → 11,版本注释记 v11 条目。
- `canvas.ts`:`TODO_H_MIN = 176`、`TODO_H_MAX = 720`(均 16 倍数;
  下限 = 卡头 + 约三行 + 添加行,上限 ≈ 略高于现行自适应观感)、
  `clampTodoHeight`(floor 取整 + 钳界,非有限归 176 附近口径对齐
  clampTodoWidth 的「非有限归缺省附近」→ 归 `floor` 后钳回;具体:
  非有限 → TODO_H_MIN)。**不做** `todoHeightOf`(undefined 即自适应,
  组件直读)。
- `store.ts`:
  - `setTodoHeight(id, height)`:floor + 钳 [176, 720];与生效高同义
    (含 undefined)不落盘;todo-not-found。不钳画布(向下无界)。
  - `clearDoneTodoItems(todoId)`:滤除 done 条目,余条目 renumber 保序;
    无完成条目不落盘返回原卡;todo-not-found。
- `migrations.ts`:v10→v11 零改写块(todos 引用原样);统一修复处给
  height 补钳回(非有限剥离为 undefined?——**钳回**,对齐 width 的
  「非有限归缺省附近」:NaN/±∞ 剥离,有限越界钳回)。
- `importExport.ts`:ingest 待办逐字恢复处给 height 补
  `clampTodoHeight`(同 width 的钳回口径;undefined 保持不物化)。

## 验收

- canvas.test:clampTodoHeight 边界/取整/非有限。
- store.test:setTodoHeight(写回钳界、floor、同义不落盘、未找到);
  clearDoneTodoItems(清完成保未完成相对序、无完成不落盘、未找到)。
- migrations.test:v10 状态升 v11 零改写(引用不变);height 非法值
  修复(有限越界钳回、非有限剥离)。
- importExport.test:height 随 JSON 备份往返逐字;非法高度导入钳回。

## Comments

- 2026-11-16 实现定案:clampTodoHeight 非有限归下界 176(高的缺省是
  「不定长」而非定值,垃圾输入当最近合法界——与 clampTodoWidth 归
  floor(CARD_W) 同思路);setTodoHeight 同义判断 `card.height === next`
  (undefined 时任何定值都是新义,不能套 width 的 todoWidthOf 口径);
  迁移修复与导入 ingest 的非有限 height **剥离为 undefined** 而非钳回
  下界(垃圾值不物化用户没选过的定长),与写路径非有限归 176 分工。
  测试:canvas 1 例、store 3 例、migrations 3 例、importExport 1 例。
