# 04: 搜索框

**What to build:** 初始页顶部搜索框:输入即实时过滤全部收藏(匹配标题/URL/备注,不区分大小写),无匹配显示空状态;回车用默认搜索引擎搜索输入词(本票默认 Bing,可硬编码;设置化由工单 08 接管);清空输入恢复完整分组视图。

**Blocked by:** 02(收藏核心:领域层 + 初始页增删改)

**Status:** resolved

- [x] 输入即过滤:标题/URL/备注不区分大小写子串匹配
- [x] 无匹配时显示中文空状态提示
- [x] 回车新开标签页跳默认引擎(Bing)的搜索结果
- [x] 清空输入恢复完整分组视图
- [x] 过滤逻辑有测试(可放在领域层或纯过滤模块)
- [x] 中文界面、深浅色跟随系统

## Comments

- 2026-10-28: 已实现并合入 spec/start-page(merge commit c313579)。filterState 纯函数 + SearchBox;引擎 URL 收敛于 src/newtab/searchEngine.ts(供 08 设置化);62 测试全绿。分支 ticket/04-search-box(3ff4512..18872b7)。
