# 03 分组折叠(默认展开、持久化)

Status: done

## 问题

分组没有折叠能力(用户反馈 #2;ui-refresh/04 曾移除旧折叠)。分组多了以后想临时收起一部分。

## 方案

- 列头加折叠钮(ChevronDown 展开 / ChevronRight 折叠),aria-expanded。
- 折叠态:仅渲染列头(不挂载列表 DOM),网格单元自然变矮。
- 默认全部展开;折叠集存 localStorage(`start-page.collapsed-groups`,groupId 数组),
  刷新后保持。分组被删后条目自动清理(读取时过滤不存在的 id)。
- 折叠与拖拽、编辑模式正交:任何模式都可折叠;搜索时忽略折叠(过滤视图照常展示命中)?

  **决策:搜索中不折叠**——搜索目的是找内容,折叠会藏住命中项;查询非空时全部临时展开。

## 验收

- 折叠/展开即时生效,刷新后状态保持;新分组默认展开。
- 折叠态不渲染组内 DOM(测试断言);`npm test`、typecheck 过。

## Comments

- 2026-10-29 实现:列头 chevron 折叠钮(旋转过渡 160ms),折叠态不挂列表 DOM;
  localStorage(start-page.collapsed-groups)持久化,删组剔除;搜索时强制展开。
