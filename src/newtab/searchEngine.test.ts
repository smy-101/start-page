import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE_ID, ENGINES, ENGINE_IDS, resolveEngineId, searchUrl } from './searchEngine'

// 引擎表与设置感知的 searchUrl:URL 只在本模块构造(工单 08 接管工单 04 的硬编码必应)
describe('搜索引擎 URL', () => {
  it('未指定引擎时默认必应,查询词 URL 编码', () => {
    expect(searchUrl('浏览器 起始页')).toBe(
      'https://www.bing.com/search?q=%E6%B5%8F%E8%A7%88%E5%99%A8%20%E8%B5%B7%E5%A7%8B%E9%A1%B5',
    )
  })

  it('两端空白剔除后再编码', () => {
    expect(searchUrl('  vite  ')).toBe('https://www.bing.com/search?q=vite')
  })

  it('按所选引擎构造搜索 URL(Google / 百度,期望值为独立验证的已知样例)', () => {
    expect(searchUrl('浏览器 起始页', 'google')).toBe(
      'https://www.google.com/search?q=%E6%B5%8F%E8%A7%88%E5%99%A8%20%E8%B5%B7%E5%A7%8B%E9%A1%B5',
    )
    expect(searchUrl('起始页', 'baidu')).toBe(
      'https://www.baidu.com/s?wd=%E8%B5%B7%E5%A7%8B%E9%A1%B5',
    )
  })

  it('引擎表含 Google/必应/百度三项,spec 默认必应', () => {
    expect(ENGINE_IDS).toEqual(['google', 'bing', 'baidu'])
    expect(new Set(ENGINE_IDS)).toEqual(new Set(Object.keys(ENGINES)))
    expect(DEFAULT_ENGINE_ID).toBe('bing')
    expect(ENGINES.bing.name).toBe('必应')
    expect(ENGINES.baidu.name).toBe('百度')
    expect(ENGINES.google.name).toBe('Google')
  })
})

// 持久化的引擎值经白名单校正:未知/损坏值(含原型链键名)回退默认必应
describe('引擎设置值校正', () => {
  it('已知引擎 id 原样通过', () => {
    expect(resolveEngineId('google')).toBe('google')
    expect(resolveEngineId('baidu')).toBe('baidu')
  })

  it('未知 id、非字符串、原型链键名一律回退必应', () => {
    expect(resolveEngineId('duckduckgo')).toBe('bing')
    expect(resolveEngineId('')).toBe('bing')
    expect(resolveEngineId('toString')).toBe('bing')
    expect(resolveEngineId(42)).toBe('bing')
    expect(resolveEngineId(null)).toBe('bing')
  })
})
