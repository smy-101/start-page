import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NEWTAB_PAGE,
  initNewtabRedirect,
  isEdgeUserAgent,
  isNewTabUrl,
} from "./newtabRedirect";

const EDGE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.4314.58";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

type Listener = (...args: unknown[]) => void;

function emitter() {
  const listeners: Listener[] = [];
  return {
    addListener: (listener: Listener) => void listeners.push(listener),
    emit: (...args: unknown[]) => listeners.forEach((l) => l(...args)),
    count: () => listeners.length,
  };
}

/**
 * 装上最小 chrome.* 桩:tabs.onCreated 可发射、tabs.update 可断言。
 * 返回还原函数,保持测试间互不污染。
 */
function fakeChrome(
  update: (tabId: number, props: object) => Promise<unknown>
) {
  const created = emitter();
  const g = globalThis as { chrome: Record<string, unknown> };
  const original = g.chrome;
  g.chrome = {
    ...(original ?? {}),
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    tabs: {
      onCreated: created,
      update: vi.fn(update),
    },
  };
  return {
    created,
    updateSpy: g.chrome.tabs as unknown as { update: ReturnType<typeof vi.fn> },
    restore: () => {
      g.chrome = original;
    },
  };
}

describe("Edge UA 判定(isEdgeUserAgent)", () => {
  it("Edge 桌面 UA 命中;Chrome 不误判", () => {
    expect(isEdgeUserAgent(EDGE_UA)).toBe(true);
    expect(isEdgeUserAgent(CHROME_UA)).toBe(false);
  });
});

describe("新标签页 URL 判定(isNewTabUrl)", () => {
  it.each([
    "edge://newtab/",
    "edge://newtab",
    "EDGE://NEWTAB/",
    "chrome://newtab/",
  ])("识别 %s", (url) => {
    expect(isNewTabUrl(url)).toBe(true);
  });

  it.each(["edge://settings", "https://newtab/", "about:blank", undefined])(
    "忽略 %s",
    (url) => {
      expect(isNewTabUrl(url)).toBe(false);
    }
  );
});

describe("NEWTAB_PAGE 与 manifest 同步守护", () => {
  it("扩展页路径等于 chrome_url_overrides.newtab,防双处硬编码漂移", () => {
    // 不直接 import manifest.config:@crxjs/vite-plugin 依赖 esbuild,在测试环境炸;读源文本同 guards.test.ts 范式
    const manifestSource = readFileSync(
      join(process.cwd(), "manifest.config.ts"),
      "utf8"
    );
    const newtabOverride = manifestSource.match(
      /chrome_url_overrides:\s*\{[^}]*newtab:\s*"([^"]+)"/
    );
    expect(newtabOverride?.[1]).toBe(NEWTAB_PAGE);
  });
});

describe("initNewtabRedirect 接线", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("Edge:新建 edge://newtab 标签(带 pendingUrl)重定向到扩展页", () => {
    const f = fakeChrome(async () => ({}));
    restore = f.restore;
    initNewtabRedirect(EDGE_UA);

    f.created.emit({ id: 7, pendingUrl: "edge://newtab/" });

    expect(f.updateSpy.update).toHaveBeenCalledWith(7, {
      url: `chrome-extension://test/${NEWTAB_PAGE}`,
    });
  });

  it("Edge:仅 url 字段(无 pendingUrl)也能识别", () => {
    const f = fakeChrome(async () => ({}));
    restore = f.restore;
    initNewtabRedirect(EDGE_UA);

    f.created.emit({ id: 8, url: "edge://newtab/" });

    expect(f.updateSpy.update).toHaveBeenCalledWith(8, {
      url: `chrome-extension://test/${NEWTAB_PAGE}`,
    });
  });

  it("Edge:非新标签页 URL 与缺 id 的标签不动", () => {
    const f = fakeChrome(async () => ({}));
    restore = f.restore;
    initNewtabRedirect(EDGE_UA);

    f.created.emit({ id: 9, pendingUrl: "https://example.com/" });
    f.created.emit({ pendingUrl: "edge://newtab/" });

    expect(f.updateSpy.update).not.toHaveBeenCalled();
  });

  it("Chrome:不注册监听,零行为", () => {
    const f = fakeChrome(async () => ({}));
    restore = f.restore;
    initNewtabRedirect(CHROME_UA);

    f.created.emit({ id: 10, pendingUrl: "chrome://newtab/" });

    expect(f.created.count()).toBe(0);
    expect(f.updateSpy.update).not.toHaveBeenCalled();
  });

  it("重定向失败:吞掉拒绝并告警,不影响后续开标签", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fakeChrome(async () => {
      throw new Error("no tab with id");
    });
    restore = f.restore;
    initNewtabRedirect(EDGE_UA);

    f.created.emit({ id: 11, pendingUrl: "edge://newtab/" });
    await Promise.resolve();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
