/**
 * URL 规范化:收藏判重的唯一实现,手动添加与导入(spec 决策)必须共用。
 * 规则:协议与主机小写、去 fragment、去默认端口、根路径去尾斜杠;
 * 无协议的输入按 https 补全(手动添加常见输入)。返回 null 表示不可收藏。
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // 仅 http(s) 视为已有协议,否则补 https——避免 “localhost:3000” 被误判为 localhost: 协议
  const withScheme = /^https?:/i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  // 主机须含点(或为 localhost / IP 字面量)——“不是网址” 这类 IDNA 单标签主机不当作网址
  if (!/\./.test(url.hostname) && url.hostname !== 'localhost' && !url.hostname.startsWith('[')) {
    return null
  }

  url.hash = ''
  // URL 构造器已自动小写协议/主机并去掉默认端口(80/443)
  const path = url.pathname === '/' ? '' : url.pathname
  return `${url.protocol}//${url.host}${path}${url.search}`
}
