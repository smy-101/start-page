# 01 领域模型与迁移(schema v8)

Status: done

types.ts 加 `TodoItem`/`TodoCard`/`todos?`、`SCHEMA_VERSION = 8`;
迁移 v7→v8 补缺省 `todos: []`;`statesEqual` 纳入 todos;
`isFreshInstallState` 加零待办卡;`filterState` 搜索丢 todos;
importExport:校验形状、replace 逐字恢复(CARD_W 钳界)、merge 追加重生成 id、
HTML 不参与。错误码 `empty-todo-text`/`todo-not-found`/`todo-item-not-found`/
`invalid-todo-order` + 中文文案。

Blocked by: (none)
