import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

/**
 * 懒挂载契约(工单 10b / ADR-0002):
 * - 折叠分组挂载 0 张卡片(卸载而非 CSS 隐藏:组件零渲染 + DOM 零节点)
 * - 新建分组默认折叠;全新安装首屏所有分组折叠,且落盘(刷新后保持)
 * - 老用户已持久化的折叠状态升级后保持(不重置)
 * - 搜索强制展开折叠组,清空后恢复各自折叠态
 */

// 观测缝:统计真实 BookmarkCard 组件函数的执行(比 DOM 可见性更强的「零挂载」证据)
const mountedCards = { titles: [] as string[] };
vi.mock("./BookmarkCard", async () => {
  const actual =
    await vi.importActual<typeof import("./BookmarkCard")>("./BookmarkCard");
  const Counted = (
    props: React.ComponentProps<typeof actual.BookmarkCard> & {
      children?: ReactNode;
    }
  ) => {
    mountedCards.titles.push(props.bookmark.title);
    return <actual.BookmarkCard {...props} />;
  };
  return { BookmarkCard: Counted };
});

/** 老版本遗留的侧通道键:直接预置即模拟升级前的持久化状态。 */
const COLLAPSED_KEY = "start-page:collapsed-groups";

/** 预置状态:收集箱 1 条 + 工作 2 条。 */
function seededState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [
      { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      { id: "g-work", name: "工作", color: "#e99695", order: 1 },
    ],
    bookmarks: [
      {
        id: "b-inbox",
        url: "https://inbox.example.com",
        title: "收件",
        note: "",
        groupId: INBOX_GROUP_ID,
        order: 0,
      },
      {
        id: "b-w1",
        url: "https://w1.example.com",
        title: "工作一",
        note: "",
        groupId: "g-work",
        order: 0,
      },
      {
        id: "b-w2",
        url: "https://w2.example.com",
        title: "工作二",
        note: "",
        groupId: "g-work",
        order: 1,
      },
    ],
  };
}

beforeEach(() => {
  localStorage.clear();
  mountedCards.titles = [];
});

describe("懒挂载:折叠分组零挂载", () => {
  it("折叠分组只挂表头:0 张卡片组件渲染、0 个卡片 DOM 节点", async () => {
    // 老用户语义:已记录折叠偏好,工作分组折叠
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(["g-work"]));
    render(<App adapter={createMemoryStorage(seededState())} />);

    const work = await screen.findByRole("region", { name: "工作" });
    expect(
      within(work).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
    expect(within(work).queryByRole("listitem")).toBeNull();
    // 卡片组件零渲染:不是 display:none 藏起来(CSS 隐藏会让数千条仍占满 DOM)
    expect(mountedCards.titles).toEqual(["收件"]);
    // DOM 级证据:折叠组内连隐藏节点都不存在
    expect(work.querySelectorAll(".card")).toHaveLength(0);
    expect(work.querySelector(".group-grid")).toBeNull();
  });
});

describe("懒挂载:全新安装与新建分组默认折叠", () => {
  it("全新安装首屏所有分组折叠(此处为收集箱):只挂表头,空态提示不挂载", async () => {
    render(<App adapter={createMemoryStorage()} />);

    const inbox = await screen.findByRole("region", { name: "收集箱" });
    expect(
      within(inbox).getByRole("button", { name: "展开分组 收集箱" })
    ).toBeInTheDocument();
    expect(within(inbox).queryByText("还没有收藏")).toBeNull();
    expect(mountedCards.titles).toEqual([]);

    // 展开后空态提示才出现(折叠确为「未挂载」而非「藏起来」)
    fireEvent.click(
      within(inbox).getByRole("button", { name: "展开分组 收集箱" })
    );
    expect(await within(inbox).findByText("还没有收藏")).toBeInTheDocument();
  });

  it("折叠缺省已落盘:重新挂载(模拟刷新)后收集箱仍折叠", async () => {
    const storage = createMemoryStorage();
    const { unmount } = render(<App adapter={storage} />);
    await screen.findByRole("region", { name: "收集箱" });
    unmount();

    render(<App adapter={storage} />);
    const again = await screen.findByRole("region", { name: "收集箱" });
    expect(
      within(again).getByRole("button", { name: "展开分组 收集箱" })
    ).toBeInTheDocument();
    expect(within(again).queryByText("还没有收藏")).toBeNull();
  });

  it("新建分组后即为折叠态,且落盘(刷新后保持)", async () => {
    const storage = createMemoryStorage();
    const { unmount } = render(<App adapter={storage} />);
    await screen.findByRole("heading", { name: "收集箱" });

    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.change(within(dialog).getByLabelText("分组名"), {
      target: { value: "工作" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));

    const work = await screen.findByRole("region", { name: "工作" });
    expect(
      within(work).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
    expect(within(work).queryByText("还没有收藏")).toBeNull();
    unmount();

    render(<App adapter={storage} />);
    const again = await screen.findByRole("region", { name: "工作" });
    expect(
      within(again).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
  });
});

describe("懒挂载:老用户升级不重置", () => {
  it("已持久化的折叠集合照办:工作折叠、收集箱展开", async () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(["g-work"]));
    render(<App adapter={createMemoryStorage(seededState())} />);

    const work = await screen.findByRole("region", { name: "工作" });
    expect(
      within(work).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(
      within(inbox).getByRole("button", { name: "折叠分组 收集箱" })
    ).toBeInTheDocument();
    expect(within(inbox).getByRole("listitem")).toBeInTheDocument();
  });

  it("已记录的空集(老用户明确全展开)不被重置为折叠", async () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([]));
    render(<App adapter={createMemoryStorage(seededState())} />);

    const work = await screen.findByRole("region", { name: "工作" });
    expect(
      within(work).getByRole("button", { name: "折叠分组 工作" })
    ).toBeInTheDocument();
    expect(within(work).getAllByRole("listitem")).toHaveLength(2);
  });

  it("从未记录偏好但已有收藏(升级老用户):视图维持全展开,且不写入折叠键", async () => {
    render(<App adapter={createMemoryStorage(seededState())} />);

    const work = await screen.findByRole("region", { name: "工作" });
    expect(
      within(work).getByRole("button", { name: "折叠分组 工作" })
    ).toBeInTheDocument();
    // 不落盘:下次加载仍走同一判定,不会突变
    expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
  });
});

describe("懒挂载:搜索与折叠配合", () => {
  it("全部折叠时搜索强制展开命中组,清空后恢复折叠", async () => {
    localStorage.setItem(
      COLLAPSED_KEY,
      JSON.stringify([INBOX_GROUP_ID, "g-work"])
    );
    render(<App adapter={createMemoryStorage(seededState())} />);
    const work = await screen.findByRole("region", { name: "工作" });
    expect(within(work).queryByRole("listitem")).toBeNull();

    fireEvent.change(screen.getByLabelText("搜索收藏"), {
      target: { value: "工作一" },
    });

    const hit = await screen.findByRole("link", { name: /工作一/ });
    expect(hit).toHaveAttribute("href", "https://w1.example.com");

    fireEvent.change(screen.getByLabelText("搜索收藏"), {
      target: { value: "" },
    });

    const collapsedAgain = await screen.findByRole("region", { name: "工作" });
    expect(within(collapsedAgain).queryByRole("listitem")).toBeNull();
    expect(
      within(collapsedAgain).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(
      within(inbox).getByRole("button", { name: "展开分组 收集箱" })
    ).toBeInTheDocument();
  });
});
