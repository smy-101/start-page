# 02 抽取 normalizeTodoCard:迁移修复与导入恢复的规范化合一

Status: ready-for-agent

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

Blocked by: (none)
