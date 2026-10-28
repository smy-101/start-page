import { describe, expect, it } from 'vitest'
import { normalizeUrl } from './url'

describe('URL 规范化(判重的唯一实现)', () => {
  it.each([
    // [输入, 规范化结果]——规则:协议/主机小写、去 fragment、去默认端口、根路径去尾斜杠
    ['HTTPS://Example.COM/', 'https://example.com'],
    ['https://example.com/#section', 'https://example.com'],
    ['http://example.com:80/path', 'http://example.com/path'],
    ['https://example.com:443/path?q=1#top', 'https://example.com/path?q=1'],
    ['https://example.com', 'https://example.com'],
    ['https://example.com/path/', 'https://example.com/path/'],
    ['https://example.com:8443/', 'https://example.com:8443'],
    ['  https://Example.com/  ', 'https://example.com'],
    // 无协议的裸主机名按 https 补全(手动添加的常见输入)
    ['example.com', 'https://example.com'],
    ['example.com/docs', 'https://example.com/docs'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected)
  })

  it.each([
    [''],
    ['   '],
    ['not a url at all'],
    ['chrome://extensions'],
    ['ftp://example.com'],
    ['https://'],
  ])('无法收藏的输入返回 null:%s', (input) => {
    expect(normalizeUrl(input)).toBeNull()
  })
})
