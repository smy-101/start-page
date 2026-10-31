import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../domain/types";
import type { SettingsAdapter, Settings } from "./settings";
import { createMemorySettingsStorage } from "./settings";
import { createMemoryStorage } from "../storage/memoryStorage";
import { App } from "./App";

// App 背景接线(seam 4):settings.background → 初始页视口 CSS 变量
// --start-background;进设置页撤下;恢复默认清除。CSS 铺法本身属浏览器行为不测。
const IMAGE_DATA_URL = "data:image/webp;base64,QUJD";

function pageBackground(): string {
  return document.documentElement.style
    .getPropertyValue("--start-background")
    .trim();
}

/** 设有背景的标记(canvas-bounds-align/05):画布磨砂底面借此启用。 */
function backgroundFlag(): boolean {
  return document.documentElement.hasAttribute("data-start-background");
}

async function renderApp(settingsAdapter?: SettingsAdapter) {
  const adapter: StorageAdapter = createMemoryStorage();
  const view = render(
    <App
      adapter={adapter}
      settingsAdapter={settingsAdapter ?? createMemorySettingsStorage()}
    />
  );
  await screen.findByRole("button", { name: "设置" });
  return { adapter, settingsAdapter, unmount: view.unmount };
}

async function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  await screen.findByRole("heading", { name: "设置" });
}

async function backToStart() {
  fireEvent.click(screen.getByRole("button", { name: "返回初始页" }));
  // 初始页无标题(ui 移除):头部「进入白板」开关是初始页视图的标志
  await screen.findByRole("button", { name: "进入白板" });
}

afterEach(() => {
  document.documentElement.style.removeProperty("--start-background");
  document.documentElement.removeAttribute("data-start-background");
});

describe("背景应用到初始页", () => {
  it("纯色背景:视口 CSS 变量为该色", async () => {
    await renderApp(
      createMemorySettingsStorage({
        engine: "bing",
        iconFetch: true,
        background: { kind: "color", color: "#d9dee5" },
      })
    );

    expect(pageBackground()).toBe("#d9dee5");
    expect(backgroundFlag()).toBe(true);
  });

  it("图片背景:cover 居中、不随滚动(fixed)", async () => {
    await renderApp(
      createMemorySettingsStorage({
        engine: "bing",
        iconFetch: true,
        background: { kind: "image", dataUrl: IMAGE_DATA_URL },
      })
    );

    expect(pageBackground()).toBe(
      `url("${IMAGE_DATA_URL}") center / cover no-repeat fixed`
    );
    expect(backgroundFlag()).toBe(true);
  });

  it("默认背景:不设变量(跟随石墨/雾纸)", async () => {
    await renderApp();

    expect(pageBackground()).toBe("");
    expect(backgroundFlag()).toBe(false);
  });
  it("进设置页撤下背景,返回初始页恢复", async () => {
    await renderApp(
      createMemorySettingsStorage({
        engine: "bing",
        iconFetch: true,
        background: { kind: "color", color: "#d9dee5" },
      })
    );
    expect(pageBackground()).toBe("#d9dee5");

    await openSettings();
    expect(pageBackground()).toBe("");
    expect(backgroundFlag()).toBe(false);

    await backToStart();
    expect(pageBackground()).toBe("#d9dee5");
    expect(backgroundFlag()).toBe(true);
  });

  it("设置页选色/恢复默认:持久化到设置存储,返回初始页生效", async () => {
    const settingsAdapter = createMemorySettingsStorage({
      engine: "bing",
      iconFetch: true,
      background: { kind: "default" },
    });
    await renderApp(settingsAdapter);
    await openSettings();

    // 色板选色 → 落盘
    const group = screen.getByRole("radiogroup", { name: "背景颜色" });
    fireEvent.click(group.querySelector("input[type=radio]")!);
    await waitFor(async () => {
      const saved = (await settingsAdapter.load()) as Settings;
      expect(saved.background).toEqual({ kind: "color", color: "#e9ebef" });
    });
    await backToStart();
    expect(pageBackground()).toBe("#e9ebef");

    // 恢复默认 → 落盘并撤下
    await openSettings();
    fireEvent.click(screen.getByRole("button", { name: "恢复默认背景" }));
    await waitFor(async () => {
      const saved = (await settingsAdapter.load()) as Settings;
      expect(saved.background).toEqual({ kind: "default" });
    });
    await backToStart();
    expect(pageBackground()).toBe("");
  });
});
