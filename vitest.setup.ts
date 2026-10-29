import '@testing-library/jest-dom/vitest'

// UI 组件(Favicon)会调 chrome.runtime.getURL;领域层与存储适配器均不依赖 chrome。
// 真实 Chrome 会合并 path 的前导斜杠,桩保持同一行为
;(globalThis as { chrome?: object }).chrome ??= {
  runtime: {
    getURL: (path: string) => `chrome-extension://test/${path.replace(/^\/+/, '')}`,
  },
}
