# 03 白板模式门禁 + nudge + 入口常驻

Status: ready-for-agent

Blocked by: 02

## 问题

白板模式(原「编辑模式」改名)成为唯一拖拽入口;日常态锁死但发现性不倒退(board-refresh/04 教训)。

## 方案

- 模式状态:`editMode` 更名 `whiteboardMode`(状态、props、测试、文案「编辑/完成」→「进入白板/完成」);GROUPS 词条已在 GLOSSARY 落地
- 门禁:非白板模式画布 `pointerdown` 拖动意图(位移 >5px)→ nudge「布局已锁定,进入白板模式后才能拖动分组 [进入白板]」;4s 自动消隐;一键进入
- 入口常驻:头部「进入白板」按钮(样式沿用 edit-toggle 位);白板内出「自动整理」「完成」
- 搜索时禁拖(过滤态坐标操作无意义),nudge 也不出
- 组头常时拖拽(board-refresh/04)移进门禁内;`GroupHeader` 的 `draggable={mode==="view"}` 随之门禁化(白板模式内组拖拽走 Pointer 定位,原生 DnD 只留组内收藏排序)

## 验收

- EditMode 测试更名 + 新增:日常态拖不动、nudge 出现且可一键进入、进入后可拖
- 组头非白板模式无 grab 光标/把手
- `npm test`、typecheck 过

## Comments

- 2026-10-29 立票。原型 B 变体即本票终态(`prototype/board-whiteboard` → `?variant=B`)。
