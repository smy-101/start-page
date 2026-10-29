import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createMemorySettingsStorage } from "./settings";

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderApp(settingsAdapter = createMemorySettingsStorage()) {
  render(
    <App adapter={createMemoryStorage()} settingsAdapter={settingsAdapter} />
  );
  await screen.findByRole("heading", { name: "收集箱" });
  return settingsAdapter;
}

describe("搜索胶囊:引擎切换(ui-refresh/03)", () => {
  it("胶囊内显示当前引擎;点开菜单列出全部引擎,选中即持久化并立即生效", async () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const settingsAdapter = await renderApp();

    expect(screen.getByRole("button", { name: "必应" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "必应" }));
    const menu = screen.getByRole("listbox", { name: "搜索引擎" });
    expect(menu).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Google" }));

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(await settingsAdapter.load()).toEqual({
      engine: "google",
      iconFetch: true,
    });

    fireEvent.change(screen.getByLabelText("搜索收藏"), {
      target: { value: "起始页" },
    });
    fireEvent.keyDown(screen.getByLabelText("搜索收藏"), { key: "Enter" });

    expect(open).toHaveBeenCalledWith(
      "https://www.google.com/search?q=%E8%B5%B7%E5%A7%8B%E9%A1%B5",
      "_blank",
      "noopener"
    );
  });

  it("持久化:同适配器重挂载(模拟重开浏览器)后仍为所选引擎", async () => {
    const settingsAdapter = createMemorySettingsStorage();
    await renderApp(settingsAdapter);

    fireEvent.click(screen.getByRole("button", { name: "必应" }));
    fireEvent.click(screen.getByRole("option", { name: "百度" }));
    expect(await settingsAdapter.load()).toEqual({
      engine: "baidu",
      iconFetch: true,
    });

    render(
      <App adapter={createMemoryStorage()} settingsAdapter={settingsAdapter} />
    );
    expect(
      await screen.findByRole("button", { name: "百度" })
    ).toBeInTheDocument();
  });

  it("Esc 或点击胶囊外部关闭菜单,不改变所选引擎", async () => {
    const settingsAdapter = await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "必应" }));
    const menu = screen.getByRole("listbox", { name: "搜索引擎" });
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "必应" }));
    expect(
      screen.getByRole("listbox", { name: "搜索引擎" })
    ).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    expect(screen.getByRole("button", { name: "必应" })).toBeInTheDocument();
    // 未发生过切换:持久化层不应有写入(默认引擎只在内存)
    expect(await settingsAdapter.load()).toBeNull();
  });

  it("设置页不再有搜索引擎区块", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByRole("heading", { name: "设置" });

    expect(screen.queryByRole("heading", { name: "搜索引擎" })).toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: "默认搜索引擎" })
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "从浏览器书签导入" })
    ).toBeInTheDocument();
  });
});
