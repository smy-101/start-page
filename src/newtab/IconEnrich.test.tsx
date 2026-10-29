import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createMemorySettingsStorage } from "./settings";

/**
 * 添加收藏 → 异步补图标 → 回填重渲染 的页面级闭环(board-refresh/05)。
 * 桩:chrome.permissions(已授权)+ 全局 fetch(假站点路由)。
 */

const PAGE_HTML = `<!doctype html><head>
  <title>新站标题</title>
  <link rel="icon" sizes="64x64" href="/icon.png">
</head><body>hi</body>`;

function installStubs(): void {
  const chromeObj = (globalThis as { chrome: Record<string, unknown> }).chrome;
  chromeObj.permissions = {
    contains: async () => true,
    request: async () => true,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://newsite.com")
        return new Response(PAGE_HTML, {
          headers: { "content-type": "text/html" },
        });
      if (url === "https://newsite.com/icon.png")
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        });
      return new Response("not found", { status: 404 });
    })
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (globalThis as { chrome: Record<string, unknown> }).chrome.permissions;
});

describe("添加收藏时抓取网页图标(board-refresh/05)", () => {
  it("已授权时:添加入库 → 异步抓 icon/标题 → 回填重渲染", async () => {
    installStubs();
    render(
      <App
        adapter={createMemoryStorage(null)}
        settingsAdapter={createMemorySettingsStorage(null)}
      />
    );
    await screen.findByRole("region", { name: "收集箱" });

    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    fireEvent.change(screen.getByLabelText("网址", { exact: false }), {
      target: { value: "newsite.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加收藏" }));

    // 先以主机名标题入库,随后 icon 与 <title> 回填
    await waitFor(() => {
      const card = screen.getByRole("listitem");
      const img = card.querySelector("img.favicon");
      expect(img?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
      expect(within(card).getByText("新站标题")).toBeInTheDocument();
    });
  });

  it("拒绝授权:自动关闭开关,不弹网络请求,添加本身不受影响", async () => {
    const chromeObj = (globalThis as { chrome: Record<string, unknown> })
      .chrome;
    chromeObj.permissions = {
      contains: async () => false,
      request: async () => false,
    };
    const fetchSpy = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchSpy);

    const settings = createMemorySettingsStorage(null);
    render(
      <App adapter={createMemoryStorage(null)} settingsAdapter={settings} />
    );
    await screen.findByRole("region", { name: "收集箱" });

    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    fireEvent.change(screen.getByLabelText("网址", { exact: false }), {
      target: { value: "newsite.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加收藏" }));

    await screen.findByRole("listitem");
    await waitFor(() => expect(fetchSpy).not.toHaveBeenCalled());
    // 开关被自动关闭并落盘
    await waitFor(() =>
      expect(settings.load()).resolves.toMatchObject({ iconFetch: false })
    );
  });
});
