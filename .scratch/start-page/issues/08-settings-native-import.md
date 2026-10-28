# 08: 设置页 + 原生书签导入

**What to build:** 初始页右上角齿轮进入设置页(中文):默认搜索引擎选择(Google / Bing / 百度,默认 Bing),搜索框回车立即按所选引擎生效(替换工单 04 的硬编码);「从浏览器书签导入」一键读取原生书签树(chrome.bookmarks:顶层文件夹→分组、散项→收集箱,URL 判重跳过,完成后统计报告);导入/导出入口从初始页迁入设置页。设置持久化于本地存储。

**Blocked by:** 04(搜索框), 07(导入导出双格式双向)

**Status:** resolved

- [x] 初始页右上角齿轮可见,进入中文设置页
- [x] 引擎选择保存后,搜索框回车按新引擎搜索(硬编码移除)
- [x] 原生书签导入:顶层文件夹→分组、无文件夹散项→收集箱、判重跳过、统计报告
- [x] 导入(HTML/JSON)与导出(JSON/HTML)入口收纳于设置页,初始页不再直接暴露
- [x] 设置项持久化,重开浏览器后保持
- [x] 深浅色跟随系统

## Comments

- 2026-10-28: 已实现并合入 spec/start-page(merge commit 01a72b9)。App 内设置视图 + settings 存储键 + searchEngine 引擎表(Google/Bing/百度,默认 Bing);原生书签树→分组纯函数 + ingestParsedBookmarks 共用判重管线;161 测试全绿。分支 ticket/08-settings-native-import(550b8f0..de49432)。
