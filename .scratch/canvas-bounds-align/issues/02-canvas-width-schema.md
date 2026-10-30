# 02 schema v4:canvasWidth 入库 + store.setCanvasWidth

Status: done

Blocked by: 01

## 问题

画布宽要持久化并与分组坐标同库同备份;当前 schema v3 无处可放。

## 方案

- `BookmarkState.canvasWidth?: number`(可选:旧测试夹具与防御运行时零改动;
  读取统一走 `canvasWidthOf(state)` 归一为 `DEFAULT_CANVAS_W` 缺省)。
- `SCHEMA_VERSION = 4`;迁移链按版本分段:v3 备份**不再重铺坐标**只补宽度;
  v2 及更早先铺坐标再补宽度。幂等不变。
- `store.setCanvasWidth(width)`:钳回界限后落盘;缩宽时越界分组 x 重钳到新右界
  (`clampToCanvas(pos, newW)`);无实际变化不落盘。返回 `Result<number>`(生效宽度)。
- 导入导出:JSON 备份逐字携带;`parseStateJson` 对 canvasWidth 只认数字且可缺省
  (v3 备份导入后走迁移补默认);`restoreFrom` 用备份自身宽度钳回坐标与宽度。
- `statesEqual` 比较画布宽(缺省按 1200 归一后比)。

## 验收

- store.test / migrations.test / importExport.test / guards(invariants)新增用例全绿;
  既有 v3 夹具测试零改动仍绿。

## Comments

- 2026-11-04 完成。落地:SCHEMA_VERSION=4、`canvasWidth?: number`(可选兼容旧夹具,读取走
  canvasWidthOf);迁移链分段重构(v3 → v4 只补宽不重铺坐标——旧实现对任何旧版本一律重铺,
  这次是行为修复点);末尾统一修复非法宽。`store.setCanvasWidth`(缩宽重钳越界分组、无变化
  不落盘);导入导出:replace 携带备份宽、merge 保留本地宽、canvasWidth 非数字拒收/越界钳回;
  statesEqual 归一比较。v3 备份 replace 升 v4 补默认 1200(宽外坐标不被默认宽钳毁的回归用例)。
