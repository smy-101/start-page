# 收藏数据存插件自有存储,不使用原生书签

核心需求"分组"(颜色、任意排序、备注)超出 `chrome.bookmarks` 的文件夹模型,且原生书签管理器里的用户操作会反向破坏插件数据。决定:收藏与分组存于 `chrome.storage.local` 的自有数据模型,原生书签仅作一次性导入来源。代价是无浏览器账号云同步,以 JSON/HTML 导入导出补偿。

## Considered Options

- ~~`chrome.bookmarks` 作为数据源,分组映射文件夹~~:分组元数据放不下;双 UI 互相干扰。
