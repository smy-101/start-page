import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";

// 折叠状态走 localStorage 侧通道,测试间清空避免串扰
beforeEach(() => {
  localStorage.clear();
});

async function renderApp() {
  render(<App adapter={createMemoryStorage()} />);
  await screen.findByRole("heading", { name: "收集箱" });
  // 全新安装首屏分组默认折叠(工单 10b);本文件流程以展开收集箱为前提,
  // 工单 ui-refresh/04 移除折叠后此前置删除
  const toggle = screen.queryByRole("button", { name: "展开分组 收集箱" });
  if (toggle) {
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: "折叠分组 收集箱" });
  }
}

/** 打开添加弹窗(默认「添加收藏」页签)。 */
async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
  return screen.findByRole("dialog");
}

describe("添加弹窗:入口与页签", () => {
  it("初始页无常驻表单;点 + 打开弹窗,默认落在「添加收藏」页签", async () => {
    await renderApp();

    expect(screen.queryByLabelText("网址")).toBeNull();
    expect(screen.queryByLabelText("分组名")).toBeNull();

    const dialog = await openDialog();

    expect(within(dialog).getByLabelText("网址")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("tab", { name: "添加收藏" })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(dialog).getByRole("tab", { name: "新建分组" })
    ).toHaveAttribute("aria-selected", "false");
  });

  it("Esc 与点击遮罩都能关闭;关闭后可再次打开", async () => {
    await renderApp();
    const dialog = await openDialog();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    const dialog2 = await openDialog();
    const overlay = dialog2.parentElement!;
    fireEvent.click(overlay);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("添加弹窗:添加收藏", () => {
  it("提交成功后弹窗关闭,收藏出现在收集箱", async () => {
    await renderApp();
    const dialog = await openDialog();

    fireEvent.change(within(dialog).getByLabelText("网址"), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("标题"), {
      target: { value: "示例站" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));

    expect(await screen.findByText("示例站")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("重复网址被拒:错误在弹窗内就地展示,弹窗不关", async () => {
    await renderApp();
    let dialog = await openDialog();

    fireEvent.change(within(dialog).getByLabelText("网址"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));
    await screen.findByText("example.com");
    expect(screen.queryByRole("dialog")).toBeNull();

    dialog = await openDialog();
    fireEvent.change(within(dialog).getByLabelText("网址"), {
      target: { value: "HTTPS://EXAMPLE.com/#x" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));

    expect(
      await within(dialog).findByText("该网址已在收藏中")
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("添加弹窗:新建分组", () => {
  it("切页签建组:成功后弹窗关闭,新分组分区出现", async () => {
    await renderApp();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.change(within(dialog).getByLabelText("分组名"), {
      target: { value: "工作" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));

    expect(
      await screen.findByRole("region", { name: "工作" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("空分组名被拒:错误留在弹窗内", async () => {
    await renderApp();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));

    expect(
      await within(dialog).findByText("分组名不能为空")
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
