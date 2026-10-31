# 02 抽取 normalizeTodoCard:迁移修复与导入恢复的规范化合一

Status: done

来源:同批 code-review(Standards P2,Duplicated Code with drift)。

## 问题

待办卡字段规范化存在两份,且有实际漂移:

- `src/domain/migrations.ts` `needsTodoRepair` + 修复 map(~146-170 行);
- `src/domain/importExport.ts` `restoreFrom`(~486-516 行,span 换算围绕共享的 `legacySpanWidth` 又实现了一遍)。

**具体漂移**:非字符串 `color: 42` 走迁移修复会被剥掉;但**当前版本的备份**导入走 `restoreFrom` 不经 `migrateState`,原样放行入库(importExport.ts:538-541)。

## 方案

抽单一 `normalizeTodoCard`(领域层),迁移修复与 `restoreFrom` 共同调用;
顺手把 `color: 42` 漂移修掉(恢复路径同样剥非法值)。

## 验收

- 新增测试:当前版本备份携带非字符串 `color` → `restoreFrom` 后被剥;
- `npm test` 全绿;v9→v10 迁移行为不变。

## Comments

- 2026-10-31 实现完成:`normalizeTodoCard` 落 migrations.ts(迁移终末修复与 restoreFrom 共用;宽锶回(可选 bound 供恢复随画布收窄)/color 剥非 string/height 钳或剥/残遗 span 剥离)。**span 换算不入共用函数**:migrations.test 754 行钉死「v10 残遗 span 只剥不换、宽保持缺省」,而 v9 备份换算属恢复侧前置——restoreFrom 先求 raw 宽(width ?? legacySpanWidth(span))再传入。输出改为不物化 undefined 值键(JSON 等价,既有 toEqual 断言全过)。新增红→绿测试:当前版备份 color:42 恢复后被剥(Object.hasOwn 验证键不存在);511 全绿。
- 2026-10-31 评审收尾:两轴评审(Standards 无硬违规;Spec 两条 P2)。真修:①迁移路径垃圾宽语义漂移——统一后 `Math.min` 会把字符串宽("400")隐式强转成 400,旧迁移口径是 clampTodoWidth 的 isFinite 兜底归 389;修法为 bound 存在时才参与 min(恢复路径的旧式强转语义保留),补测试钉住 [389,389];②restoreFrom 双重断言取宽改局部常量。不修(误读/已认领):CSS 已是「一条逗号底色+两条变体长度」结构(评审读的是 diff 旧块);undefined 键形状变化与 H 拖拽起点看 committed 的 1-2 帧窗口差已在票面认领,不可测。512 测试全绿。

Blocked by: (none)
