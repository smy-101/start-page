import { describe, expect, it } from 'vitest'
import { searchUrl } from './searchEngine'

// 回车跳转搜索:当前硬编码必应;工单 08(搜索引擎设置)接管时,本文件只改期望值,不改行为语义
describe('搜索引擎 URL', () => {
  it('默认引擎为必应,查询词 URL 编码', () => {
    expect(searchUrl('浏览器 起始页')).toBe(
      'https://www.bing.com/search?q=%E6%B5%8F%E8%A7%88%E5%99%A8%20%E8%B5%B7%E5%A7%8B%E9%A1%B5',
    )
  })

  it('两端空白剔除后再编码', () => {
    expect(searchUrl('  vite  ')).toBe('https://www.bing.com/search?q=vite')
  })
})
