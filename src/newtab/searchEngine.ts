/**
 * 搜索引擎缝隙:回车跳转的搜索 URL 只在本模块构造(UI 与测试均不感知具体引擎)。
 * 工单 08:硬编码必应升级为引擎表(Google / 必应 / 百度,spec 默认必应),
 * 由设置页选择、本地持久化;searchUrl 按传入引擎构造。
 */
export type EngineId = 'google' | 'bing' | 'baidu'

export interface SearchEngine {
  /** 中文显示名(设置页单选) */
  name: string
  /** 搜索 URL 前缀,拼接 URL 编码后的查询词 */
  searchUrl: string
}

export const ENGINES: Record<EngineId, SearchEngine> = {
  google: { name: 'Google', searchUrl: 'https://www.google.com/search?q=' },
  bing: { name: '必应', searchUrl: 'https://www.bing.com/search?q=' },
  baidu: { name: '百度', searchUrl: 'https://www.baidu.com/s?wd=' },
}

/** spec 默认引擎:必应。 */
export const DEFAULT_ENGINE_ID: EngineId = 'bing'

/** 持久化值白名单校正:未知/损坏值(含原型链键名)回退默认必应。 */
export function resolveEngineId(raw: unknown): EngineId {
  return typeof raw === 'string' && Object.prototype.hasOwnProperty.call(ENGINES, raw)
    ? (raw as EngineId)
    : DEFAULT_ENGINE_ID
}

export function searchUrl(query: string, engine: EngineId = DEFAULT_ENGINE_ID): string {
  return ENGINES[engine].searchUrl + encodeURIComponent(query.trim())
}
