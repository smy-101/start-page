import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createBookmarkStore } from "../domain/store";
import { createMemoryStorage } from "../storage/memoryStorage";
import { iconPathsFor, initToolbar, toolbarStateFor } from "./toolbar";

describe("工具栏图标选择(iconPathsFor)", () => {
  it("已收藏与未收藏同用描边位图(勾走右下角✓徽标),不可收藏用浅灰 disabled", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "x",
    });
    if (!added.ok) throw new Error("fixture setup failed");

    const outline = {
      "16": "icons/outline-16.png",
      "32": "icons/outline-32.png",
    };
    expect(iconPathsFor({ kind: "unfavorited" })).toEqual(outline);
    // 已收藏:图标本体不变(类 AdGuard 的勾由 badge 叠加)
    expect(iconPathsFor({ kind: "favorited", bookmark: added.value })).toEqual(
      outline
    );

    const unbookmarkable = iconPathsFor({ kind: "unbookmarkable" });
    expect(unbookmarkable["16"]).toBe("icons/disabled-16.png");
    expect(unbookmarkable["32"]).toBe("icons/disabled-32.png");
  });

  it("generate-icons 产物齐全:状态位图均在 public/icons(供 dist 构建复制)", () => {
    const publicIcons = join(__dirname, "../../public/icons");
    for (const name of [
      "outline-16.png",
      "outline-32.png",
      "disabled-16.png",
      "disabled-32.png",
    ]) {
      expect(
        existsSync(join(publicIcons, name)),
        `public/icons/${name} 缺失`
      ).toBe(true);
    }
  });
});

describe("工具栏图标状态判定(toolbarStateFor)", () => {
  it("chrome:// 等特殊页面与拿不到 URL 的标签页呈不可收藏态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(toolbarStateFor("chrome://settings", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor("edge://favorites", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor("about:blank", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(
      toolbarStateFor("chrome-extension://abc/newtab.html", store)
    ).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor(undefined, store)).toEqual({
      kind: "unbookmarkable",
    });
  });

  it("可收藏但未收藏的页面呈未收藏态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(toolbarStateFor("https://Example.com/#top", store)).toEqual({
      kind: "unfavorited",
    });
  });

  it("已收藏页面呈已收藏态,并带回该收藏供点击取消", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "示例站",
    });
    if (!added.ok) throw new Error("fixture setup failed");

    const state = toolbarStateFor("HTTPS://Example.com#frag", store);

    // 判定走规范化 URL:大小写与 fragment 差异不影响命中
    expect(state).toEqual({ kind: "favorited", bookmark: added.value });
  });

  it("收藏被取消后回到未收藏态(同一 URL)", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({ url: "https://example.com" });
    if (!added.ok) throw new Error("fixture setup failed");

    await store.removeBookmark(added.value.id);

    expect(toolbarStateFor("https://example.com", store)).toEqual({
      kind: "unfavorited",
    });
  });
});

/**
 * initToolbar 点击接线(ui-refresh/01 补记):收藏/取消的首选反馈是页内
 * toast,不可注入页面回退徽标文字一闪(FLASH_MS 后恢复常驻 ✓)。
 * 该接线此前无测试覆盖(code-review Spec P2),此处以 chrome.* 桩驱动。
 */
describe("initToolbar 点击反馈接线", () => {
  type Listener = (...args: unknown[]) => void;
  const g = globalThis as { chrome: Record<string, unknown> };

  /** 最小事件发射器(chrome.events 形状)。 */
  function emitter() {
    const listeners: Listener[] = [];
    return {
      addListener: (l: Listener) => void listeners.push(l),
      removeListener: () => {},
      emit: (...args: unknown[]) => listeners.forEach((l) => l(...args)),
    };
  }

  /**
   * 装上 chrome.* 桩:action 徽标记录 + tabs/storage 内存实现 +
   * 可注入失败的 scripting。返回记录器与还原函数。
   */
  function fakeChrome(exec: () => Promise<unknown>) {
    const data: Record<string, unknown> = {};
    const badgeTexts: { tabId?: number; text: string }[] = [];
    const action = {
      setIcon: vi.fn(async () => {}),
      setTitle: vi.fn(async () => {}),
      setBadgeText: vi.fn(async (o: { tabId?: number; text: string }) => {
        badgeTexts.push(o);
      }),
      setBadgeBackgroundColor: vi.fn(async () => {}),
      onClicked: emitter(),
    };
    const tab = { id: 7, url: "https://example.com/page", title: "示例页" };
    const executeScript = vi.fn(exec);
    const original = g.chrome;
    g.chrome = {
      ...(original ?? {}),
      action,
      tabs: {
        get: vi.fn(async () => tab),
        query: vi.fn(async () => [tab]),
        onActivated: emitter(),
        onUpdated: emitter(),
      },
      scripting: { executeScript },
      storage: {
        local: {
          get: vi.fn(async (key: string) =>
            key in data ? { [key]: data[key] } : {}
          ),
          set: vi.fn(async (obj: Record<string, unknown>) => {
            Object.assign(data, obj);
          }),
        },
        onChanged: emitter(),
      },
      permissions: { contains: vi.fn(async () => false) },
    };
    return {
      action,
      executeScript,
      badgeTexts,
      restore: () => (g.chrome = original),
    };
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("toast 注入成功:不出徽标文字,常驻 ✓ 徽标表达已收藏", async () => {
    vi.useFakeTimers();
    const f = fakeChrome(async () => [{ result: undefined }]);
    try {
      initToolbar();
      await vi.advanceTimersByTimeAsync(0); // 冷启动校准(refreshActiveTabIcon)
      (f.action.onClicked as unknown as { emit: Listener }).emit({
        id: 7,
        url: "https://example.com/page",
        title: "示例页",
      });
      await vi.advanceTimersByTimeAsync(0);

      // toast 打过;徽标只走常驻通道(收藏后 ✓),无「已收藏」文字一闪
      expect(f.executeScript).toHaveBeenCalledTimes(1);
      expect(f.badgeTexts.some((b) => b.text === "已收藏")).toBe(false);
      expect(f.badgeTexts.at(-1)).toEqual({ tabId: 7, text: "✓" });
    } finally {
      f.restore();
    }
  });

  it("toast 注入失败(不可注入页):回退徽标「已收藏」一闪,FLASH_MS 后恢复 ✓", async () => {
    vi.useFakeTimers();
    const f = fakeChrome(async () => {
      throw new Error("cannot access contents of the page");
    });
    try {
      initToolbar();
      await vi.advanceTimersByTimeAsync(0);
      (f.action.onClicked as unknown as { emit: Listener }).emit({
        id: 7,
        url: "https://example.com/page",
        title: "示例页",
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(f.badgeTexts.some((b) => b.text === "已收藏")).toBe(true);

      await vi.advanceTimersByTimeAsync(1200);
      // 一闪结束:回退通道关闭,常驻 ✓ 表达已收藏
      expect(f.badgeTexts.at(-1)).toEqual({ tabId: 7, text: "✓" });
    } finally {
      f.restore();
    }
  });
});
