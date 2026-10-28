# 06: 右键菜单收藏到组

**What to build:** 任意网页右键菜单出现「收藏到 →」:子菜单列出收集箱与所有自定义分组,点击即收藏当前页到该组;若当前页已收藏,菜单提供「取消收藏」,选择其他组则视为移动到该组;分组增删、改名时菜单自动重建。chrome:// 等特殊页面不出现收藏菜单项。菜单事件由 service worker 处理,写数据走领域层。

**Blocked by:** 02(收藏核心:领域层 + 初始页增删改)

**Status:** resolved

- [x] 右键任意网页可见「收藏到 →」子菜单,列出收集箱 + 自定义分组
- [x] 点击即收藏,初始页对应分组可见该收藏
- [x] 已收藏页:菜单含「取消收藏」;选择其他组 = 移动到该组(单属不变量保持)
- [x] 分组增删/改名后菜单自动重建(下次右键即见最新分组)
- [x] chrome:// 等特殊页面无收藏菜单项
- [x] 中文菜单文案;所需 contextMenus 权限声明齐全

## Comments

- 2026-10-28: 已实现并合入 spec/start-page(merge commit c4edcac)。动态子菜单 + storage.onChanged 重建 + documentUrlPatterns 白名单;moveBookmark 入领域层;与 05 的 SW 入口合并为单一 background index;测试全绿。分支 ticket/06-context-menu-favorite(0a5b384..616fc00)。
