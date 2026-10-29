import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { pointerEvent, queryNudge } from "./testUtils";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

/**
 * 白板模式门禁(board-whiteboard/03,原编辑模式 ui-refresh/04 更名):
 * 白板模式是唯一开拖拽与编辑 UI 的状态;日常态锁死且发现性不倒退
 * ——组头无把手无 grab,拖动意图出 nudge 一键进入。
 * 墙体已退役(board-whiteboard/04):白板是唯一看板视图。
 */

function seededState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [
      {
        id: INBOX_GROUP_ID,
        name: "收集箱",
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
      { id: "g-work", name: "工作", color: "#e99695", order: 1, x: 0, y: 0 },
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

/** 画布(排除头部开关的按钮断言范围)。 */
async function board(): Promise<HTMLElement> {
  const el = document.querySelector(".whiteboard-canvas");
  if (!(el instanceof HTMLElement)) throw new Error("看板未渲染");
  return el;
}

describe("白板模式(原编辑模式,ui-refresh/04 + board-whiteboard/03 门禁)", () => {
  it("日常态页面干净:无编辑/删除,组头无把手不可拖", async () => {
    await renderSeeded();

    const canvas = await board();
    expect(
      within(canvas).queryAllByRole("button", { name: "编辑" })
    ).toHaveLength(0);
    expect(
      within(canvas).queryAllByRole("button", { name: "删除" })
    ).toHaveLength(0);
    expect(
      within(canvas).queryAllByRole("button", { name: /^编辑分组/ })
    ).toHaveLength(0);
    expect(
      within(canvas).queryAllByRole("button", { name: /^删除分组/ })
    ).toHaveLength(0);

    const inboxRegion = screen.getByRole("region", { name: "收集箱" });
    const card = within(inboxRegion).getByRole("listitem");
    expect(card).toHaveAttribute("draggable", "false");
    // 组头不再携带原生 DnD(ADR-0004 墙退役):无 draggable、无把手暗示
    const work = screen.getByRole("region", { name: "工作" });
    expect(work.querySelector(".group-header")).not.toHaveAttribute(
      "draggable"
    );
  });

  it("进入后行出编辑/删除并可拖拽,列头出分组操作;完成后恢复干净", async () => {
    await renderSeeded();

    fireEvent.click(screen.getByRole("button", { name: "进入白板" }));
    expect(
      screen.queryByRole("button", { name: "进入白板" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();

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
    // 组头无原生 DnD:分组移动走画布 Pointer 拖拽(见 Whiteboard.test)

    fireEvent.click(screen.getByRole("button", { name: "完成" }));

    const boardAgain = await board();
    expect(
      within(boardAgain).queryAllByRole("button", { name: "编辑" })
    ).toHaveLength(0);
    expect(
      within(boardAgain).queryAllByRole("button", { name: "删除" })
    ).toHaveLength(0);
    expect(
      screen.getByRole("button", { name: "进入白板" })
    ).toBeInTheDocument();
  });

  it("组间换位 DnD 已退役(墙退役):组头 dragstart 被画布拦下,drop 不换位", async () => {
    await renderSeeded();

    const work = screen.getByRole("region", { name: "工作" });
    // 组头无原生 DnD;即便人为拖起,落点也不换位(分支已删)
    expect(fireEvent.dragStart(work.querySelector(".group-header")!)).toBe(
      false
    );
    fireEvent.drop(screen.getByRole("region", { name: "收集箱" }));
    await waitFor(() => expect(sectionNames()).toEqual(["收集箱", "工作"]));

    // 白板模式内同样拦:分组移动只走画布 Pointer 拖拽
    fireEvent.click(screen.getByRole("button", { name: "进入白板" }));
    expect(fireEvent.dragStart(work.querySelector(".group-header")!)).toBe(
      false
    );
    fireEvent.drop(screen.getByRole("region", { name: "收集箱" }));
    await waitFor(() => expect(sectionNames()).toEqual(["收集箱", "工作"]));
  });
});

describe("白板画布门禁 + nudge(board-whiteboard/03)", () => {
  it("日常态拖动意图出 nudge,一键进入后可拖", async () => {
    await renderSeeded();
    const groupWork = screen.getByRole("region", { name: "工作" });

    // 日常态:按住分组卡移动(位移 >5px)→ nudge 引导,卡片不动
    act(() => {
      groupWork.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 30, clientY: 40 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 101, clientY: 90 })
      );
    });
    expect(queryNudge()).toBeInTheDocument();
    expect(
      screen.getByText("布局已锁定,进入白板模式后才能拖动分组")
    ).toBeInTheDocument();

    // 一键进入:头部开关翻到「完成」,编辑控件出现,nudge 消隐
    fireEvent.click(
      within(queryNudge()!).getByRole("button", { name: "进入白板" })
    );
    expect(queryNudge()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑分组 工作" })
    ).toBeInTheDocument();

    // 进入后可拖:Pointer 拖拽写回落点(jsdom 几何 0,吸附坐标即
    // 指针差 (101−30, 90−40) → 71,50 → 网格 (64,48))
    const canvas = document.querySelector(".whiteboard-canvas")!;
    expect(canvas).not.toHaveAttribute("data-locked");
    act(() => {
      groupWork.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 30, clientY: 40 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 101, clientY: 90 })
      );
    });
    expect(groupWork).toHaveAttribute("data-drag-active", "true");
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    await waitFor(() =>
      expect(groupWork).toHaveStyle({ left: "64px", top: "48px" })
    );
  });

  it("头部入口常驻:白板内出自动整理,完成回到日常", async () => {
    await renderSeeded();

    // 日常态:无工具行,只有常驻头部入口
    expect(
      screen.queryByRole("button", { name: "自动整理" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入白板" }));
    expect(
      screen.getByRole("button", { name: "自动整理" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(
      screen.queryByRole("button", { name: "自动整理" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "进入白板" })
    ).toBeInTheDocument();
  });
});

describe("分组默认展开,可折叠(board-refresh/03)", () => {
  it("渲染即见组内收藏行,无需展开;空分组显示空态提示", async () => {
    render(
      <App
        adapter={createMemoryStorage({
          schemaVersion: SCHEMA_VERSION,
          groups: [
            {
              id: INBOX_GROUP_ID,
              name: "收集箱",
              color: "#3b82f6",
              order: 0,
              x: 0,
              y: 0,
            },
            {
              id: "g-empty",
              name: "空组",
              color: "#9fe295",
              order: 1,
              x: 0,
              y: 0,
            },
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

/** 页面上分组分区的顺序,即组间排序结果(同 GroupManagement 测试)。 */
function sectionNames(): string[] {
  return screen
    .getAllByRole("region")
    .filter((el) => el.classList.contains("group"))
    .map((el) => el.getAttribute("aria-label") ?? "");
}
