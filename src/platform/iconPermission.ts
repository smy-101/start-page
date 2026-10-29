/**
 * 图标抓取的宿主权限缝隙(board-refresh/05):fetch 任意网站需要 host 权限,
 * 声明为 optional,首次添加收藏时从用户手势里请求。
 * 权限判定是 chrome.* 薄封装,归 platform 层;领域层保持零 chrome 依赖。
 */

/** 抓取任意网站需要 host 权限;扩展声明为 optional,仅在用户手势里请求。 */
const ORIGINS: chrome.permissions.Permissions = { origins: ["<all_urls>"] };

/** 是否已拥有读取任意网站的权限。 */
export async function hasHostPermission(): Promise<boolean> {
  return chrome.permissions.contains(ORIGINS);
}

/**
 * 请求读取任意网站的权限。必须在用户手势(如提交按钮点击)内调用;
 * SW 里非手势上下文调用会 reject,统一吞掉按拒绝处理。
 */
export async function requestHostPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.request(ORIGINS);
  } catch {
    return false;
  }
}
