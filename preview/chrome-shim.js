/**
 * chrome.* 垫片:仅在本地预览 harness 中生效(扩展真实环境无此模块)。
 * 必须最先导入 — App/Favicon 等模块在运行期访问 chrome.runtime / chrome.storage。
 * favicon 端点指向不存在的路径 → 触发字母回退块,正好评审回退设计。
 */
globalThis.chrome = {
  runtime: {
    getURL: (path) => `${window.location.origin}/__preview-no-favicon${path}`,
  },
  storage: {
    local: {
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
    },
    onChanged: {
      addListener: () => {},
      removeListener: () => {},
    },
  },
};
