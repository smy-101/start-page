import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

beforeEach(() => {
  localStorage.clear();
});

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
        note: "常用",
        groupId: "g-work",
        order: 0,
      },
    ],
  };
}

async function renderSeeded() {
  render(<App adapter={createMemoryStorage(seededState())} />);
  await screen.findByRole("region", { name: "工作" });
}

/** 看板容器(排除头部「编辑」开关的按钮断言范围)。 */
async function wall(): Promise<HTMLElement> {
  const el = document.querySelector(".groups-wall");
  if (!(el instanceof HTMLElement)) throw new Error("看板未渲染");
  return el;
}

describe("编辑模式(ui-refresh/04)", () => {
  it("正常状态页面干净:行与列头无编辑/删除按钮,不可拖拽", async () => {
    await renderSeeded();

    const board = await wall();
    expect(
      within(board).queryAllByRole("button", { name: "编辑" })
    ).toHaveLength(0);
    expect(
      within(board).queryAllByRole("button", { name: "删除" })
    ).toHaveLength(0);
    expect(
      within(board).queryAllByRole("button", { name: /^编辑分组/ })
    ).toHaveLength(0);
    expect(
      within(board).queryAllByRole("button", { name: /^删除分组/ })
    ).toHaveLength(0);

    const inboxRegion = screen.getByRole("region", { name: "收集箱" });
    const card = within(inboxRegion).getByRole("listitem");
    expect(card).toHaveAttribute("draggable", "false");
    const work = screen.getByRole("region", { name: "工作" });
    expect(work.querySelector(".group-header")).toHaveAttribute(
      "draggable",
      "false"
    );
  });

  it("开启后行出编辑/删除并可拖拽,列头出分组操作;关闭后恢复干净", async () => {
    await renderSeeded();

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    const work = screen.getByRole("region", { name: "工作" });
    const card = within(work).getByRole("listitem");
    expect(
      within(card).getByRole("button", { name: "编辑" })
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "删除" })
    ).toBeInTheDocument();
    expect(card).toHaveAttribute("draggable", "true");
    expect(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    ).toBeInTheDocument();
    expect(
      within(work).getByRole("button", { name: "删除分组 工作" })
    ).toBeInTheDocument();
    expect(work.querySelector(".group-header")).toHaveAttribute(
      "draggable",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    const boardAgain = await wall();
    expect(
      within(boardAgain).queryAllByRole("button", { name: "编辑" })
    ).toHaveLength(0);
    expect(
      within(boardAgain).queryAllByRole("button", { name: "删除" })
    ).toHaveLength(0);
  });
});

describe("分组常显(ui-refresh/04:折叠已移除)", () => {
  it("渲染即见组内收藏行,无需展开;空分组显示空态提示", async () => {
    render(
      <App
        adapter={createMemoryStorage({
          schemaVersion: SCHEMA_VERSION,
          groups: [
            { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
            { id: "g-empty", name: "空组", color: "#9fe295", order: 1 },
          ],
          bookmarks: [
            {
              id: "b1",
              url: "https://example.com",
              title: "示例",
              note: "",
              groupId: INBOX_GROUP_ID,
              order: 0,
            },
          ],
        })}
      />
    );
    await screen.findByRole("region", { name: "空组" });

    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(within(inbox).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("还没有收藏")).toBeInTheDocument();
  });
});
