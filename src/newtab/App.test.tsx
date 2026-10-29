import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createBookmarkStore } from "../domain/store";

beforeEach(() => {
  localStorage.clear();
});

async function renderApp() {
  render(<App adapter={createMemoryStorage()} />);
  await screen.findByRole("heading", { name: "收集箱" });
  // 工单 10b:全新安装首屏所有分组默认折叠;本文件的增删改流程以展开收集箱为前提
  // (折叠/展开行为本身由 App.lazyMount.test.tsx 钉住)
  await expandGroup("收集箱");
}

/** 展开指定分组(若折叠):流程测试的前置动作。 */
async function expandGroup(name: string) {
  const toggle = screen.queryByRole("button", { name: `展开分组 ${name}` });
  if (toggle) {
    fireEvent.click(toggle);
    await screen.findByRole("button", { name: `折叠分组 ${name}` });
  }
}

async function addBookmark(url: string, title: string, note = "") {
  // 成功提交后的关弹窗是异步的;连续添加时先等上一轮弹窗关闭再开新的
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("网址"), {
    target: { value: url },
  });
  fireEvent.change(within(dialog).getByLabelText("标题"), {
    target: { value: title },
  });
  if (note)
    fireEvent.change(within(dialog).getByLabelText("备注"), {
      target: { value: note },
    });
  fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));
}

describe("初始页:添加收藏到收集箱", () => {
  it("空收集箱渲染分组标题与空状态提示", async () => {
    await renderApp();

    expect(screen.getByRole("heading", { name: "收集箱" })).toBeInTheDocument();
    expect(screen.getByText("还没有收藏")).toBeInTheDocument();
  });

  it("填写网址/标题/备注提交后,收藏卡片出现在收集箱,弹窗关闭", async () => {
    await renderApp();

    await addBookmark("https://example.com", "示例站", "第一条");

    const card = await screen.findByRole("listitem");
    expect(within(card).getByText("示例站")).toBeInTheDocument();
    expect(within(card).getByText("https://example.com")).toBeInTheDocument();
    expect(within(card).getByText("第一条")).toBeInTheDocument();
    // ui-refresh/02:提交成功即关弹窗(表单状态随弹窗销毁,重开为空)
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("重复 URL 添加被拒,界面给出中文提示", async () => {
    await renderApp();
    await addBookmark("https://example.com", "第一条");
    await screen.findByRole("listitem");

    await addBookmark("HTTPS://EXAMPLE.com/#x", "第二条");

    expect(await screen.findByText("该网址已在收藏中")).toBeInTheDocument();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText("第一条")).toBeInTheDocument();
  });

  it("无效网址被拒,界面给出中文提示且不产生收藏", async () => {
    await renderApp();

    await addBookmark("不是网址", "无效");

    expect(
      await screen.findByText("网址无效,请输入完整网址")
    ).toBeInTheDocument();
    expect(screen.getByText("还没有收藏")).toBeInTheDocument();
  });
});

describe("初始页:添加与编辑选分组(spec 故事 17/24)", () => {
  async function createGroup(name: string) {
    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.change(within(dialog).getByLabelText("分组名"), {
      target: { value: name },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));
    await screen.findByRole("region", { name });
    // 工单 10b:新建分组默认折叠;后续流程需要组内卡片可见
    await expandGroup(name);
    return screen.getByRole("region", { name });
  }

  function pickGroup(scope: HTMLElement, groupName: string) {
    const select = within(scope).getByLabelText("所属分组");
    const option = within(select).getByRole("option", {
      name: groupName,
    }) as HTMLOptionElement;
    fireEvent.change(select, { target: { value: option.value } });
  }

  it("手动添加选分组:收藏落到所选分组而非收集箱", async () => {
    await renderApp();
    const work = await createGroup("工作");

    // ui-refresh/02:选组在弹窗内完成(表单不再常驻页面)
    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    const dialog = await screen.findByRole("dialog");
    pickGroup(dialog, "工作");
    fireEvent.change(within(dialog).getByLabelText("网址"), {
      target: { value: "https://work.example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("标题"), {
      target: { value: "工作站" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));

    expect(await within(work).findByText("工作站")).toBeInTheDocument();
    expect(within(work).getAllByRole("listitem")).toHaveLength(1);
    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(within(inbox).queryByRole("listitem")).toBeNull();
    expect(within(inbox).getByText("还没有收藏")).toBeInTheDocument();
  });

  it("编辑改所属分组:保存后收藏移到目标分组,原组不再有该卡片", async () => {
    await renderApp();
    const work = await createGroup("工作");
    await addBookmark("https://move.example.com", "待移动");

    const card = await screen.findByRole("listitem");
    fireEvent.click(within(card).getByRole("button", { name: "编辑" }));
    pickGroup(card, "工作");
    fireEvent.click(within(card).getByRole("button", { name: "保存" }));

    expect(await within(work).findByText("待移动")).toBeInTheDocument();
    expect(within(work).getAllByRole("listitem")).toHaveLength(1);
    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(within(inbox).queryByRole("listitem")).toBeNull();
    expect(within(inbox).getByText("还没有收藏")).toBeInTheDocument();
  });
});

describe("初始页:跨上下文同步", () => {
  it("其他上下文(如工具栏 service worker)写入后,已打开的初始页即时刷新", async () => {
    const storage = createMemoryStorage();
    render(<App adapter={storage} />);
    await screen.findByRole("heading", { name: "收集箱" });
    // 全新安装默认折叠(工单 10b);跨上下文同步观察卡片需要展开态
    await expandGroup("收集箱");
    expect(screen.getByText("还没有收藏")).toBeInTheDocument();

    const toolbarContext = await createBookmarkStore(storage);
    await toolbarContext.addBookmark({
      url: "https://example.com",
      title: "工具栏收藏",
    });

    const card = await screen.findByText("工具栏收藏");
    expect(card).toBeInTheDocument();

    const found = toolbarContext.findBookmarkByUrl("https://example.com");
    if (!found) throw new Error("fixture setup failed");
    await toolbarContext.removeBookmark(found.id);

    expect(await screen.findByText("还没有收藏")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});

describe("初始页:收藏卡片", () => {
  it("点击卡片在新标签页打开网页", async () => {
    await renderApp();
    await addBookmark("https://example.com", "示例站");

    const link = await screen.findByRole("link", { name: /示例站/ });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("编辑标题/备注保存后卡片更新", async () => {
    await renderApp();
    await addBookmark("https://example.com", "旧标题");
    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
    const card = screen.getByRole("listitem");

    fireEvent.change(within(card).getByLabelText("标题"), {
      target: { value: "新标题" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "保存" }));

    expect(await screen.findByText("新标题")).toBeInTheDocument();
    expect(screen.queryByText("旧标题")).toBeNull();
  });

  it("编辑时把 URL 改成重复值,提示且保留原值", async () => {
    await renderApp();
    await addBookmark("https://a.example.com", "A");
    await addBookmark("https://b.example.com", "B");
    // 弹窗提交后的渲染是异步的:计数断言需重试等待,不能只 findAll 到首张就断言
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2)
    );

    const card = screen.getAllByRole("listitem")[0];
    fireEvent.click(within(card).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(card).getByLabelText("网址"), {
      target: { value: "https://b.example.com" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "保存" }));

    expect(
      await within(card).findByText("该网址已在收藏中")
    ).toBeInTheDocument();
    // 被拒后留在编辑表单;取消可见原收藏未被改动
    fireEvent.click(within(card).getByRole("button", { name: "取消" }));
    expect(within(card).getByText("A")).toBeInTheDocument();
    expect(within(card).getByText("https://a.example.com")).toBeInTheDocument();
  });

  it("删除收藏后卡片消失,空状态恢复", async () => {
    await renderApp();
    await addBookmark("https://example.com", "示例站");

    fireEvent.click(await screen.findByRole("button", { name: "删除" }));

    expect(await screen.findByText("还没有收藏")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
