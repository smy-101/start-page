# 01 日常态可添加待办条目(门禁再开一洞)

Status: done

用户反馈:每次添加待办都要进出白板模式,高频路径背上门禁成本。
grilling 一轮三问定案(2026-10-31),ADR-0006 补记已写,GLOSSARY「白板模式」已同步。

## 决策

- 日常态开洞**仅「添加条目」**:改文字/删条目/卡内排序/改名/建卡/删卡/拖动仍锁白板模式。
- 入口:**卡尾常驻输入框**,与白板模式同款,不再按模式条件渲染(两态统一)。
- 空卡:「暂无待办」提示退役,输入框直接替代(两态同)。
- 新条目落位:store 现行语义(插未完成区末、完成区沉底)零改动。

## 改动面

- `src/newtab/TodoSection.tsx`:添加输入框去门禁;删 `{todo.items.length === 0 && !whiteboardMode}` 空提示分支。
- `src/newtab/index.css`:`.todo-empty` 规则随之清理(如无他用)。
- 测试:`TodoSection.test.tsx`(组件 seam)、`WhiteboardMode.test.tsx`(App 门禁 seam)断言同步;其余门禁断言(改文字/删条目/排序/删卡仍锁)必须保持通过。

Blocked by: (none)
