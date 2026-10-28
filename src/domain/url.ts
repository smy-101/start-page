/**
 * URL 规范化:收藏判重的唯一实现,手动添加与导入(spec 决策)必须共用。
 * 规则:协议与主机小写、去 fragment、去默认端口、根路径去尾斜杠;
 * 无协议的输入按 https 补全(手动添加常见输入)。返回 null 表示不可收藏。
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null

  url.hash = ''
  // URL 构造器已自动小写协议/主机并去掉默认端口(80/443)
  const path = url.pathname === '/' ? '' : url.pathname
  return `${url.protocol}//${url.host}${path}${url.search}`
}
