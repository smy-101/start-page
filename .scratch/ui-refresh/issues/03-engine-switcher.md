# 03: 搜索胶囊内引擎切换

**Type:** task
**Status:** ready-for-agent

## What

用户反馈:想直接在搜索框切引擎,不要去设置页。

- SearchBox 胶囊内左侧「引擎名 ▾」按钮,点开下拉菜单列出 Google / 必应 / 百度
- 选中即保存(现有 settingsAdapter 持久化链路)并立即生效(回车用所选引擎)
- 设置页「搜索引擎」区块移除;设置页只剩原生书签导入 + 导入导出
- 可达性:`aria-haspopup="listbox"`、键盘可操作、Esc 关闭菜单

## DoD

- [ ] 胶囊内可完成切换;刷新后保持(持久化链路复用)
- [ ] 回车搜索用当前所选引擎
- [ ] 设置页无引擎区块;引擎相关既有测试迁移/改写后全绿
- [ ] `npm test` / `npm run typecheck` 全绿
