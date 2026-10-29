# 09: 端到端冒烟 + 收尾

**What to build:** 用 chrome-devtools MCP(连接 Windows 端 Chrome)加载构建产物,跑全流程冒烟:安装 → 初始页手动添加收藏 → 工具栏一键收藏与图标状态切换 → 右键收藏到组 → 分组整理(建组/拖拽/删组回收) → 搜索过滤与回车搜索 → 导出 → 替换导入回环。发现的问题当场修复或立票;README 补用户视角的安装与功能使用说明。

**Blocked by:** 03(分组管理), 04(搜索框), 05(工具栏一键收藏), 06(右键菜单收藏), 07(导入导出), 08(设置页 + 原生书签导入)

**Status:** resolved

- [x] 冒烟全流程通过,步骤与结果记录(可存 docs/ 下冒烟记录)
- [x] 冒烟发现的问题已修复,或已立后续工单并在本票注明
- [x] README:开发者安装(加载 dist)、功能使用说明(中文)
- [x] 构建产物干净,`dist` 可直接加载,无开发残留
- [x] 全部测试绿

## Comments

- 2026-10-28: 已实现并合入 spec/start-page(merge commit d31e2eb)。chrome-devtools MCP(Windows Chrome)全流程冒烟 14 项全过、无产品缺陷;冒烟记录 docs/smoke-2026-10-28.md;README 补用户视角安装与使用说明。分支 ticket/09-e2e-smoke-readme(0bc3179)。
