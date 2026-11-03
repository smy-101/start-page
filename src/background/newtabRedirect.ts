/**
 * Edge 标签页图标兼容垫片(edge-compat):
 *
 * Edge 接管的新标签页 URL 是 edge://newtab,该 URL 在 Edge 的 favicon 库里没有映射,
 * 标签图标被固定成内置「文档」占位图——页面里声明 `<link rel="icon">` 也不会被查询
 * (实测 Edge 156:Favicons 库只有 chrome-extension://…/src/newtab/index.html 的映射,
 * 且刷新/重载不改变 NTP 标签图标)。Chrome 用 manifest 图标渲染覆盖页,无需处理。
 *
 * 唯一能让标签显示品牌图标的办法是让标签 URL 变成 chrome-extension://…(实测该 URL
 * 的标签会正常显示扩展图标,本仓库图标与品牌图一致)。因此仅在 Edge 下,把新建的
 * edge://newtab 标签导航到扩展页。代价(用户已确认接受):地址栏显示扩展 URL
 * (Edge 省略 chrome- 前缀,显示为 extension://…)、开新标签可能闪一下。
 */

/** 扩展页路径:与 manifest.chrome_url_overrides.newtab 保持一致(构建后位于 dist/src/newtab/index.html)。 */
export const NEWTAB_PAGE = "src/newtab/index.html";

/** Edge 桌面版 UA 标记(Chrome/Chromium 不含 Edg/)。 */
export function isEdgeUserAgent(ua: string): boolean {
  return /\bEdg\//.test(ua);
}

/** 仅认浏览器自带的「新标签页」URL;edge://newtab 可能带尾斜杠/查询/锚点。 */
export function isNewTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^(?:edge|chrome):\/\/newtab(?:[/?#]|$)/i.test(url);
}

/**
 * 注册新标签页重定向。事件监听须在 service worker 顶层同步注册(MV3 要求),
 * 故 init 只在 UA 判定通过时挂监听;非 Edge 直接返回,零行为。
 */
export function initNewtabRedirect(ua: string = navigator.userAgent): void {
  if (!isEdgeUserAgent(ua)) return;

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id === undefined) return;
    const url = tab.pendingUrl ?? tab.url;
    if (!isNewTabUrl(url)) return;
    // 失败(例如目标标签已被关闭)静默:不能让垫片影响正常开标签
    void chrome.tabs
      .update(tab.id, { url: chrome.runtime.getURL(NEWTAB_PAGE) })
      .catch((error) => {
        console.warn("Edge 新标签页图标垫片:重定向失败", error);
      });
  });
}
