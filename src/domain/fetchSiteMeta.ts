/**
 * 网页图标抓取(board-refresh/05):添加收藏时由扩展自己请求网页,
 * 解析 <link rel=icon> 并把图标转 data URL 存进收藏记录。
 * 零 chrome 依赖(fetch/DOMParser 均为注入或纯字符串解析),
 * newtab 与 service worker 共用;SW 无 DOMParser,故用正则而非 DOM 解析。
 */

/** 抓取结果:两者都尽力而为,拿不到就是 undefined(调用方静默回退)。 */
export interface SiteMeta {
  /** 图标 data URL(仅接受图片、≤上限体积) */
  icon?: string;
  /** 页面 <title>(添加弹窗标题留空时的更好默认值) */
  title?: string;
}

export interface FetchSiteMetaDeps {
  /** 注入 fetch(测试用);缺省全局 fetch */
  fetch?: typeof fetch;
  /** 各请求的超时毫秒数,默认 6000 */
  timeoutMs?: number;
  /** 图标体积上限字节,默认 128KB(存 chrome.storage,不宜过大) */
  maxIconBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_ICON_BYTES = 128 * 1024;
/** 页面 HTML 解析上限:图标/标题都在 <head>,超过此长度直接截断再匹配。 */
const MAX_HTML_CHARS = 400_000;

interface LinkCandidate {
  url: string;
  /** 优先级分:声明尺寸的边长(未声明按 0,any 按 64) */
  score: number;
}

/** 从 <link ...> 标签原文里取属性值(引号/单引号/裸值三种形态)。 */
function attrValue(tag: string, name: string): string | null {
  const re = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  );
  const m = tag.match(re);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[3] ?? "").trim();
}

/** sizes="32x32" / "any" → 优先级分;解析不了按 0。 */
function sizesScore(sizes: string | null): number {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 64;
  const m = sizes.match(/(\d+)\s*x\s*\d+/i);
  return m ? Number(m[1]) : 0;
}

/**
 * 从 HTML 头部解析图标候选与标题(纯函数,导出供单测):
 * - rel 含 icon 的 link 皆为候选(apple-touch-icon / shortcut icon / icon),
 *   按 sizes 声明取最大者;同分取先出现者
 * - 无任何 link 候选 → origin/favicon.ico 兜底
 * - 标题取首个 <title> 文本,压平空白
 */
export function parseIconCandidates(
  html: string,
  pageUrl: string
): { candidates: string[]; title?: string } {
  const head =
    html.length > MAX_HTML_CHARS ? html.slice(0, MAX_HTML_CHARS) : html;
  const origin = new URL(pageUrl).origin;

  const best = new Map<string, LinkCandidate>();
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attrValue(tag, "rel");
    if (!rel || !/\bicon\b/i.test(rel)) continue;
    const href = attrValue(tag, "href");
    if (!href) continue;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).toString();
    } catch {
      continue;
    }
    const score = sizesScore(attrValue(tag, "sizes"));
    const prev = best.get(absolute);
    if (!prev || prev.score < score)
      best.set(absolute, { url: absolute, score });
  }

  const candidates = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((c) => c.url);
  const fallback = `${origin}/favicon.ico`;
  if (!candidates.includes(fallback)) candidates.push(fallback);

  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1].replace(/\s+/g, " ").trim();

  return { candidates, title: title || undefined };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function fetchWithTimeout(
  url: string,
  deps: FetchSiteMetaDeps,
  init?: RequestInit
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  try {
    return await doFetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIconDataUrl(
  url: string,
  deps: FetchSiteMetaDeps
): Promise<string | null> {
  const maxBytes = deps.maxIconBytes ?? DEFAULT_MAX_ICON_BYTES;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, deps);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const type = (response.headers.get("content-type") ?? "").toLowerCase();
  // favicon.ico 常被报 application/octet-stream;x-icon 无 MIME 注册,一并放行
  if (
    !type.startsWith("image/") &&
    !type.includes("octet-stream") &&
    type !== ""
  ) {
    return null;
  }
  const blob = await response.blob();
  if (blob.size === 0 || blob.size > maxBytes) return null;
  try {
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/**
 * 请求网页并解析图标与标题。任何一步失败都返回部分/空结果,绝不抛出——
 * 图标抓取是尽力而为的增强,不能阻塞添加主流程。
 */
export async function fetchSiteMeta(
  pageUrl: string,
  deps: FetchSiteMetaDeps = {}
): Promise<SiteMeta> {
  const result: SiteMeta = {};
  try {
    const pageResponse = await fetchWithTimeout(pageUrl, deps, {
      redirect: "follow",
      credentials: "omit",
    });
    if (pageResponse.ok) {
      const type = (
        pageResponse.headers.get("content-type") ?? ""
      ).toLowerCase();
      if (type.startsWith("image/")) {
        // 收藏的直接就是图片:页面本身即图标
        const icon = await fetchIconDataUrl(pageUrl, deps);
        if (icon) return { icon };
        return {};
      }
      const html = await pageResponse.text();
      const { candidates, title } = parseIconCandidates(html, pageUrl);
      result.title = title;
      // 候选逐个尝试(最多 3 个),拿到即止
      for (const candidate of candidates.slice(0, 3)) {
        const icon = await fetchIconDataUrl(candidate, deps);
        if (icon) {
          result.icon = icon;
          break;
        }
      }
    }
  } catch {
    // 网络失败/超时/解析异常:返回已有部分
  }
  return result;
}
