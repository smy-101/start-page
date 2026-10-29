# 10: 大数据量性能(数千条收藏流畅度)

**Type:** task
**Status:** needs-triage
**Blocked by:** None

## What

spec story 36 「收藏增长到数千条后初始页依然流畅」当前未验证:

- 每次 storage 写入全量重建 store;
- 无虚拟化/分页;
- 冒烟仅覆盖少量数据。

需先定性能预算(如 5000 条下首屏与交互指标),再选方案(虚拟滚动/分组懒渲染/增量更新)。

来源:code-review spec-axis finding。
