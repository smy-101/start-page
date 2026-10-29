# 01 坐标数据模型与存量迁移

Status: done

Blocked by: (无)

## 问题

白板范式下分组布局 = x/y 坐标(ADR-0004),数据模型要跟上:schema V2 → V3,存量用户的 order 布局无损迁移。

## 方案

- `src/domain/types.ts`:`Group` 增 `x: number; y: number`(int,px);`SCHEMA_VERSION` → 3
- `src/domain/schemaV2.ts` 迁移链:V2 状态按 order 序装箱出坐标——高度未知时**均匀铺开退化**(同 planWall 零高策略:按列数轮流派位,每卡推高固定步长 72px,与原型引导堆叠一致);收集箱保留组同迁
- 卡宽不入库(全局常量 `CANVAS_W=1200 / GAP=16 / 卡宽=(1200−32)/3`,落 `src/newtab/board.ts` 或白板模块内)
- `importExport`:V3 导出;导入 V2 文件走同一迁移;V3 校验(坐标非负,越界钳回画布)
- 新建分组默认坐标:第一个空位(简单实现:画布底部左侧追加,同原型)

## 验收

- `schemaV2.test.ts` 扩:V2→V3 迁移快照(order 保序、坐标单调铺开、收集箱不丢)
- `importExport.test.ts` 扩:V2 导入兼容 + V3 往返
- 迁移幂等:V3 状态再跑迁移不动
- `npm test`、typecheck 过

## Comments

- 2026-10-29 立票。坐标语义与画布常量以 ADR-0004 / GLOSSARY「画布」为准。

## Comments

- 2026-10-29 交付(types.ts Group x/y + SCHEMA_VERSION=3;`domain/canvas.ts` 几何常量/追加位/钳回;`domain/migrations.ts` 迁移链;store 加载接线、statesEqual、createGroup 默认落位;importExport V2 导入同链、V3 往返钳回、merge/HTML 建组追加位)。验收全过:迁移快照/幂等/V2 导入/V3 往返,npm test 243 绿 + typecheck 0 错。
- 背离票面两处(spec 评审认可):① 模块名 `schemaV2.ts`→`migrations.ts`(连同测试文件)——文件是全量迁移链,名不钉版本号;② 几何常量落 `domain/canvas.ts` 而非 `newtab/board.ts`——迁移与导入钳回都在领域层,需要单源,票 02 的 board.ts 从这里 import。
- code-review 处置:P1 `Math.round`→`Math.floor`(round 出的 811 越过钳回右界 810.67,迁移态往返会被改写,回归测试锁死);restoreFrom 补缺收集箱补传追加位(不再与首组重叠);注释「planWall 零高策略同款」措辞修正(步长 72 出自原型,非 planWall 的 gap 16)。
- 简化注记:spec.md「order + 测高 → planWall 一次装箱」的测高主路径未实现——领域层无 DOM、高度恒未知,存量迁移恒走均匀铺开退化(验收也只要求「坐标单调铺开」);测高装箱由票 02「自动整理」承接。
