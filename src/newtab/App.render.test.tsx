import {
  fireEvent,
  render,
  screen,
  act,
  waitFor,
  within,
} from "@testing-library/react";
import { Profiler, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { enterWhiteboardMode } from "./testUtils";
import { createMemoryStorage } from "../storage/memoryStorage";
import type { BookmarkState } from "../domain/types";
import { INBOX_GROUP_NAME } from "../domain/types";

/** 记录真实 BookmarkCard 每次函数调用的卡片标题(memo 契约的观测缝) */
const mockCardRenders = { titles: [] as string[] };
vi.mock("./BookmarkCard", async () => {
  const actual =
    await vi.importActual<typeof import("./BookmarkCard")>("./BookmarkCard");
  const Counted = (
    props: React.ComponentProps<typeof actual.BookmarkCard> & {
      children?: ReactNode;
    }
  ) => {
    mockCardRenders.titles.push(props.bookmark.title);
    return <actual.BookmarkCard {...props} />;
  };
  return { BookmarkCard: Counted };
});

/**
 * 渲染行为契约(工单 10a / ADR-0002):
 * - 单次收藏变更恰好一次提交(消除 onChanged 回声与 refresh 的双重渲染)
 * - 外部上下文写入(service worker)仍触发同步 —— 跨上下文能力不得被回声抑制误伤
 */

function threeGroupsState(): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      {
        id: "inbox",
        name: INBOX_GROUP_NAME,
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
      { id: "g1", name: "工作", color: "#0ea5e9", order: 1, x: 0, y: 0 },
      { id: "g2", name: "学习", color: "#22c55e", order: 2, x: 0, y: 0 },
    ],
    bookmarks: [
      {
        id: "b0",
        url: "https://inbox.example.com",
        title: "收一件",
        note: "",
        groupId: "inbox",
        order: 0,
      },
      {
        id: "b1",
        url: "https://work.example.com",
        title: "工件",
        note: "",
        groupId: "g1",
        order: 0,
      },
      {
        id: "b2",
        url: "https://learn.example.com",
        title: "学件",
        note: "",
        groupId: "g2",
        order: 0,
      },
    ],
  };
}
function makeState(titles: string[]): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      {
        id: "inbox",
        name: INBOX_GROUP_NAME,
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
    ],
    bookmarks: titles.map((title, i) => ({
      id: "b" + i,
      url: `https://example.com/${i}`,
      title,
      note: "",
      groupId: "inbox",
      order: i,
    })),
  };
}

describe("渲染契约:单次变更单提交", () => {
  it("添加一条收藏只产生一次提交", async () => {
    let commits = 0;
    render(
      <Profiler
        id="app"
        onRender={(_id, phase) => {
          if (phase === "update") commits++;
        }}
      >
        <App adapter={createMemoryStorage()} />
      </Profiler>
    );
    await screen.findByRole("heading", { name: "收集箱" });
    commits = 0;

    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("网址"), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText("标题"), {
      target: { value: "示例站" },
    });
    // 表单输入是子组件自身状态(与被测契约无关),填完后归零再计数
    commits = 0;
    fireEvent.click(within(dialog).getByRole("button", { name: "添加收藏" }));
    await screen.findByRole("listitem");

    expect(screen.getByText("示例站")).toBeInTheDocument();
    expect(commits).toBe(1);
  });

  it("外部上下文写入仍触发一次同步(不得被回声抑制误伤)", async () => {
    const adapter = createMemoryStorage();
    let commits = 0;
    render(
      <Profiler
        id="app"
        onRender={(_id, phase) => {
          if (phase === "update") commits++;
        }}
      >
        <App adapter={adapter} />
      </Profiler>
    );
    await screen.findByRole("heading", { name: "收集箱" });
    commits = 0;

    // 模拟 service worker 等其他上下文的写入
    await act(() => adapter.save(makeState(["外部写入"])));

    expect(await screen.findByText("外部写入")).toBeInTheDocument();
    expect(commits).toBe(1);
  });
});

describe("渲染契约:无关变化不重渲染未变子树(memo)", () => {
  it("删除收藏只产生一次提交", async () => {
    let commits = 0;
    render(
      <Profiler
        id="app"
        onRender={(_id, phase) => {
          if (phase === "update") commits++;
        }}
      >
        <App adapter={createMemoryStorage(threeGroupsState())} />
      </Profiler>
    );
    await screen.findByRole("heading", { name: "工作" });
    enterWhiteboardMode();
    const learnCard = screen.getByText("学件").closest(".card") as HTMLElement;
    commits = 0;

    fireEvent.click(within(learnCard).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(screen.queryByText("学件")).toBeNull());

    expect(commits).toBe(1);
  });

  it("编辑收藏时,仅所在分组的卡片重渲染且恰好一次提交", async () => {
    let commits = 0;
    render(
      <Profiler
        id="app"
        onRender={(_id, phase) => {
          if (phase === "update") commits++;
        }}
      >
        <App adapter={createMemoryStorage(threeGroupsState())} />
      </Profiler>
    );
    await screen.findByRole("heading", { name: "工作" });
    enterWhiteboardMode();
    mockCardRenders.titles = [];

    // 通过卡片自身编辑按钮改备注(触发全状态替换)
    const workCard = screen.getByText("工件").closest(".card") as HTMLElement;
    fireEvent.click(within(workCard).getByRole("button", { name: "编辑" }));
    fireEvent.change(within(workCard).getByLabelText("备注"), {
      target: { value: "新备注" },
    });
    // 编辑态切换与备注输入是子组件自身状态(与被测契约无关),保存前归零再计数
    commits = 0;
    fireEvent.click(within(workCard).getByRole("button", { name: "保存" }));
    // ui-refresh/04:备注进 title 提示,不再占行宽 —— 以行链接的 title 断言保存生效
    await waitFor(() =>
      expect(within(workCard).getByRole("link")).toHaveAttribute(
        "title",
        "https://work.example.com\n新备注"
      )
    );

    // 被编辑卡片自身的内部状态重渲染属正常;其余分组的卡片不得重渲染
    expect(mockCardRenders.titles.filter((t) => t !== "工件")).toEqual([]);
    // 卡片退出编辑态与全状态刷新同批提交
    expect(commits).toBe(1);
  });
});
