# 04 墙体退役 + 行为回归 + perf 复测

Status: ready-for-agent

Blocked by: 02, 03

## 问题

白板正式接管排版后,瀑布流墙的壳退役;行为面(搜索/折叠/懒挂载/perf)回归收口。

## 方案

- 拆:`BookmarkGroups` 的测高/RO 墙壳与 `useWallLayout`;`planWall/wallColumnCount` 保留(自动整理 + 迁移共用),文件更名或留注均可;墙相关 CSS(`.groups-wall`)清理
- DropHint 体系判定:组内收藏排序仍用 HTML5 DnD + 插入指示(白板内),保留;组间换位的 DnD 分支删除
- 行为回归:搜索过滤态、折叠、懒挂载(10b 的 recorded 语义)、FreshImportCta 在白板下照常;改写受影响测试
- perf:perf-probe 复测首屏(ADR-0002 条款;挂载量不变,墙 RO → 画布 RO,预期持平);超预算 1.5× 走 ADR-0002 升级条款
- ADR-0003 superseded 注记已加(随本票入库);README 截图/描述更新为白板

## 验收

- 全量 `npm test`、typecheck 绿;死代码零残留(grep 验证)
- perf-probe 数字记录进本票 Comments;README 更新
- 手工烟测:全新安装 → 导入 → 白板整理 → 刷新还原

## Comments

- 2026-10-29 立票。
