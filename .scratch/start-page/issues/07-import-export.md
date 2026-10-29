# 07: 导入导出(双格式双向)

**What to build:** 数据可迁移:导出 JSON(完整状态:schemaVersion、分组含颜色顺序、收藏含备注)与 Netscape HTML(分组→一层文件夹)两种文件;导入 HTML(浏览器书签文件:文件夹→分组、书签→收藏进对应组,URL 判重跳过)与 JSON(导入前二选一:「合并」跳过重复 / 「替换全部」清空恢复);导入完成报告「新增 N 条、跳过 M 条」。HTML 解析/生成为基于 DOMParser 的纯函数,用真实浏览器导出的书签 HTML 样本作 fixture 测试。入口本票先放初始页设置区(简单按钮),工单 08 收纳进设置页。

**Blocked by:** 02(收藏核心:领域层 + 初始页增删改)

**Status:** resolved

- [x] 导出 JSON:含 schemaVersion、分组(颜色/顺序)、收藏(备注),可作为完整备份
- [x] 导出 HTML:Netscape 书签格式,Chrome 原生书签管理器可导入,分组映射一层文件夹
- [x] 导入 Chrome 导出的 HTML:文件夹→分组、书签→对应组收藏,URL 判重跳过已存在
- [x] 导入 JSON:合并(跳过重复)与替换全部(清空后恢复)两种模式行为正确
- [x] 导入完成提示「新增 N 条、跳过 M 条」
- [x] 导出 → 清空 → JSON 导入回环后数据无损(领域层测试锁定)
- [x] HTML 解析/生成纯函数 + 真实样本 fixture 的 vitest 测试
- [x] 判重与手动添加共用同一处 URL 规范化逻辑

## Comments

- 2026-10-28: 已实现并合入 spec/start-page(merge commit 2003212)。JSON/HTML 双格式双向 + DOMParser 真实样本 fixture + 判重唯一路径共用;导出→清空→导入回环无损锁定。分支 ticket/07-import-export(00e3ee4..827c1e1)。
