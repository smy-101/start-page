/**
 * 搜索引擎缝隙:回车跳转的搜索 URL 只在本模块构造。
 * 当前硬编码必应(spec 默认);工单 08(搜索引擎设置)接管时只需改这里,
 * UI 与测试均通过 searchUrl 间接使用,不感知具体引擎。
 */
const DEFAULT_ENGINE_SEARCH_URL = 'https://www.bing.com/search?q='

export function searchUrl(query: string): string {
  return DEFAULT_ENGINE_SEARCH_URL + encodeURIComponent(query.trim())
}
