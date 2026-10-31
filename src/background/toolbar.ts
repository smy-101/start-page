/**
 * 工具栏一键收藏接线:图标状态(描边=未收藏/描边+右下角绿底✓徽标=已收藏/浅灰=不可收藏,点击无效果)
 * + 点击收藏/取消。已收藏的勾用 badge 呈现(类 AdGuard:叠在原图标右下角),
 * 图标本体不变;点击反馈首选页面内浮动条(toast),不可注入页面回退徽标文字一闪。
 * 事件驱动:taps.onActivated / tabs.onUpdated / action.onClicked / storage.onChanged。
 * 收藏判定与写入全部走领域层;本模块不重复实现 URL 校验。
 */
import { createBookmarkStore, normalizeUrl } from "../domain/store";
import type { BookmarkStore } from "../domain/store";
import type { Bookmark } from "../domain/types";
import { createChromeStorage } from "../storage/chromeStorage";
import { enrichBookmarkIcon } from "./enrichIcon";
import { showTabToast, toastTextFor } from "./toast";

/** 图标路径相对扩展根;manifest 之外引用的位图经 public/icons 原样进 dist。 */
const ICON_PATHS = {
  outline: { "16": "icons/outline-16.png", "32": "icons/outline-32.png" },
  disabled: { "16": "icons/disabled-16.png", "32": "icons/disabled-32.png" },
} as const;

/**
 * 工具栏位图选择(纯函数):已收藏与未收藏同用描边书签——已收藏的勾
 * 由右下角 ✓ 徽标表达(AdGuard 式叠加),图标本体不变;不可收藏=浅灰。
 */
export function iconPathsFor(state: ToolbarState): {
  "16": string;
  "32": string;
} {
  switch (state.kind) {
    case "favorited":
    case "unfavorited":
      return ICON_PATHS.outline;
    case "unbookmarkable":
      return ICON_PATHS.disabled;
  }
}

const FLASH_MS = 1200;
/** 已收藏常驻徽标:绿底白勾,叠在描边图标右下角(AdGuard 式)。 */
const FAVORITED_BADGE = "✓";
const BADGE_COLORS = {
  favorited: "#1a7f37",
  unfavorited: "#68707a",
} as const;

/** 工具栏三态;已收藏态带回收藏本身,点击取消时无需二次查找。 */
export type ToolbarState =
  | { kind: "unbookmarkable" }
  | { kind: "unfavorited" }
  | { kind: "favorited"; bookmark: Bookmark };

/** 纯函数:标签页 URL + 收藏库 → 工具栏状态。不可收藏判定委托 normalizeUrl。 */
export function toolbarStateFor(
  url: string | undefined,
  store: BookmarkStore
): ToolbarState {
  if (url === undefined || normalizeUrl(url) === null)
    return { kind: "unbookmarkable" };
  const bookmark = store.findBookmarkByUrl(url);
  return bookmark === null
    ? { kind: "unfavorited" }
    : { kind: "favorited", bookmark };
}

function iconTitleFor(state: ToolbarState): string {
  switch (state.kind) {
    case "favorited":
      return "已收藏,点击取消收藏";
    case "unfavorited":
      return "收藏到收集箱";
    case "unbookmarkable":
      return "此页面无法收藏";
  }
}

/** 注册工具栏事件接线。须在 service worker 顶层同步调用(事件监听不迟到)。 */
export function initToolbar(): void {
  const adapter = createChromeStorage();
  // 收藏库单例:任何上下文写入状态后作废重建,保证读到最新(跨上下文同步)
  let storePromise: Promise<BookmarkStore> | null = null;
  const store = (): Promise<BookmarkStore> => {
    storePromise ??= createBookmarkStore(adapter);
    return storePromise;
  };

  async function applyIcon(tabId: number, state: ToolbarState): Promise<void> {
    await chrome.action.setIcon({ tabId, path: iconPathsFor(state) });
    await chrome.action.setTitle({ tabId, title: iconTitleFor(state) });
  }

  /** 徽标配色:瞬时提示用语义色(文字白,Chrome 自动)。 */
  async function setBadge(
    tabId: number,
    text: string,
    color?: string
  ): Promise<void> {
    await chrome.action.setBadgeText({ tabId, text });
    if (text && color)
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
  }

  /**
   * 校准某标签页图标。touchBadge=false 时不动徽标——
   * 状态写入触发的刷新若清徽标,会立刻抹掉点击后的瞬时提示。
   */
  async function refreshTabIcon(
    tabId: number,
    url?: string,
    touchBadge = true
  ): Promise<void> {
    const resolved = url ?? (await chrome.tabs.get(tabId)).url;
    const state = toolbarStateFor(resolved, await store());
    await applyIcon(tabId, state);
    // 已收藏 = 描边图标 + 右下角绿底✓徽标;其余态无徽标(不可收藏含初始页,点击无效果)
    if (touchBadge) {
      await setBadge(
        tabId,
        state.kind === "favorited" ? FAVORITED_BADGE : "",
        state.kind === "favorited" ? BADGE_COLORS.favorited : undefined
      );
    }
  }

  async function refreshActiveTabIcon(touchBadge = true): Promise<void> {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (tab?.id !== undefined)
      await refreshTabIcon(tab.id, tab.url, touchBadge);
  }

  async function handleToolbarClick(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined) return;
    const s = await store();
    const state = toolbarStateFor(tab.url, s);
    // 不可收藏页面:点击不产生数据
    if (state.kind === "unbookmarkable") return;
    const wasFavorited = state.kind === "favorited";
    if (wasFavorited) {
      await s.removeBookmark(state.bookmark.id);
    } else {
      const added = await s.addBookmark({
        url: tab.url ?? "",
        title: tab.title,
      });
      // 异步补图标:不阻塞图标状态切换(board-refresh/05)
      if (added.ok) void enrichBookmarkIcon(s, added.value);
    }
    const tabId = tab.id;
    // 首选反馈:页面内浮动提示条(贴视线);不可注入页面回退徽标文字一闪
    const toasted = await showTabToast(tabId, toastTextFor(wasFavorited));
    await refreshTabIcon(tabId, tab.url);
    if (toasted) return;
    await setBadge(
      tabId,
      wasFavorited ? "已取消" : "已收藏",
      wasFavorited ? BADGE_COLORS.unfavorited : BADGE_COLORS.favorited
    );
    setTimeout(() => {
      void refreshTabIcon(tabId);
    }, FLASH_MS);
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void refreshTabIcon(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // per-tab 图标在页面加载/导航后被浏览器重置为默认,须重设,不能只在切换标签页时设置
    if (changeInfo.status === "complete" || changeInfo.url !== undefined) {
      void refreshTabIcon(tabId, tab.url ?? changeInfo.url);
    }
  });
  chrome.action.onClicked.addListener((tab) => {
    void handleToolbarClick(tab);
  });
  // 任何上下文写入收藏(含本 SW 自己、初始页)→ 收藏库作废重建,并刷新当前标签页图标
  adapter.subscribe?.(() => {
    storePromise = null;
    void refreshActiveTabIcon(false);
  });
  // SW 冷启动/被事件唤醒时校准当前活动标签页
  void refreshActiveTabIcon();
}
