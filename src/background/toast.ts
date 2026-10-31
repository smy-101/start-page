/**
 * 标签页内瞬时提示条(收藏/取消收藏的页面内反馈):
 * 经 chrome.scripting.executeScript 注入,元素与样式完全自包含(内联样式,
 * 独立世界执行),不与页面 CSS/结构冲突。activeTab 权限恰好覆盖 action 点击
 * 手势——只在点击后对该标签页临时有权限,不新增任何主机授权。
 */

/** 提示条文案(纯函数):操作前已收藏 → 取消文案;否则收藏文案。 */
export function toastTextFor(previouslyFavorited: boolean): string {
  return previouslyFavorited ? "已取消收藏" : "✓ 已收藏到收集箱";
}

/** 注入页面执行的自包含函数(executeScript 序列化源码,禁引用外部作用域)。 */
export function pageToast(text: string): void {
  const ID = "start-page-toast";
  const HOLD_MS = 1800;
  const FADE_MS = 250;
  const HIDDEN = "translateX(-50%) translateY(8px)";
  const SHOWN = "translateX(-50%) translateY(0)";
  type ToastEl = HTMLDivElement & { hideTimer?: number; removeTimer?: number };
  let el = document.getElementById(ID) as ToastEl | null;
  if (!el) {
    el = document.createElement("div") as ToastEl;
    el.id = ID;
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      `bottom:max(24px,env(safe-area-inset-bottom))`,
      `transform:${HIDDEN}`,
      "z-index:2147483647",
      "padding:10px 18px",
      "border-radius:999px",
      "background:rgba(29,32,36,0.94)",
      "color:#f5f7fa",
      "font:500 13px/1.4 system-ui,-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,0.28)",
      "pointer-events:none",
      "opacity:0",
      `transition:opacity ${FADE_MS}ms ease,transform ${FADE_MS}ms ease`,
    ].join(";");
    document.body.appendChild(el);
  }
  const toast = el;
  toast.textContent = text;
  // 进入:下一帧切到可见态(先挂 DOM 再改样式,transition 才会播放)
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = SHOWN;
  });
  // 重复触发:清掉待隐/待移除计时器,重新计时(连续点击只留最后一条)
  clearTimeout(toast.hideTimer);
  clearTimeout(toast.removeTimer);
  toast.hideTimer = window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = HIDDEN;
    toast.removeTimer = window.setTimeout(() => toast.remove(), FADE_MS);
  }, HOLD_MS);
}

/**
 * 在标签页内弹提示条;返回是否成功。不可脚本化的页面(商店页等)抛错 →
 * 调用方回退到工具栏徽标文字提示。
 */
export async function showTabToast(
  tabId: number,
  text: string
): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: pageToast,
      args: [text],
    });
    return true;
  } catch {
    return false;
  }
}
