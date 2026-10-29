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
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

/**
 * 拖拽体验优化:插入指示线 + 悬停上/下半判定前后。
 * jsdom 没有 DragEvent 构造器,fireEvent 的 init 丢 clientY/relatedTarget;
 * 用 MouseEvent 构造(构造器存在、携带坐标),React 按事件类型照常分发。
 */

/** 带坐标的 dragover(jsdom 里卡片量高为 0,几何由 mock 供给)。 */
function dragOverWith(el: Element, clientY: number): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("dragover", { bubbles: true, cancelable: true, clientY })
    );
  });
}

/** 带 relatedTarget 的 dragleave(判定是否整墙拖离)。 */
function dragLeaveTo(el: Element, relatedTarget: Node | null): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("dragleave", { bubbles: true, relatedTarget })
    );
  });
}

/** 带坐标的 drop。 */
function dropWith(el: Element, clientY: number): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("drop", { bubbles: true, cancelable: true, clientY })
    );
  });
}

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
      { id: "g-empty", name: "空组", color: "#9fe295", order: 1, x: 0, y: 0 },
    ],
    bookmarks: ["甲", "乙", "丙"].map((title, order) => ({
      id: `b-${title}`,
      url: `https://${title}.example.com`,
      title,
      note: "",
      groupId: INBOX_GROUP_ID,
      order,
    })),
  };
}

async function renderSeeded() {
  render(<App adapter={createMemoryStorage(seededState())} />);
  await screen.findByRole("region", { name: "收集箱" });
}

function inbox(): HTMLElement {
  return screen.getByRole("region", { name: "收集箱" });
}

function cards(region: HTMLElement): HTMLElement[] {
  return within(region)
    .getAllByRole("listitem")
    .filter((el) => el.classList.contains("card"));
}

/** 指示线在列内的槽位(第几张卡之前;等于卡片数即在末尾)。 */
function indicatorSlot(region: HTMLElement): number | null {
  const grid = region.querySelector(".group-grid");
  if (!grid) return null;
  const children = Array.from(grid.children);
  const at = children.findIndex((el) =>
    el.classList.contains("drop-indicator")
  );
  return at === -1 ? null : at;
}

/** 给卡片装上真实几何(jsdom 默认全 0):top=100、height=40。 */
function withGeometry(el: HTMLElement, top = 100, height = 40): HTMLElement {
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      bottom: top + height,
      left: 0,
      right: 300,
      width: 300,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

describe("拖拽:插入指示线与前后判定", () => {
  it("悬停目标上半:指示线落在目标之前;下半:落在目标之后", async () => {
    await renderSeeded();

    fireEvent.dragStart(cards(inbox())[2]); // 拖「丙」
    const target = withGeometry(cards(inbox())[0]); // 「甲」top=100 高 40
    dragOverWith(target, 110); // 上半(中点 120)
    expect(indicatorSlot(inbox())).toBe(0);

    dragOverWith(target, 130); // 下半
    expect(indicatorSlot(inbox())).toBe(1);
  });

  it("悬停分区非卡片区:指示线落到组末尾,空组也给出放置坑位", async () => {
    await renderSeeded();

    fireEvent.dragStart(cards(inbox())[0]);
    fireEvent.dragOver(inbox());
    expect(indicatorSlot(inbox())).toBe(3); // 甲乙丙之后

    const empty = screen.getByRole("region", { name: "空组" });
    fireEvent.dragOver(empty);
    expect(indicatorSlot(empty)).toBe(0);
    expect(within(empty).queryByText("还没有收藏")).not.toBeInTheDocument();
  });

  it("松手按判定落位:下半悬停插到目标之后", async () => {
    await renderSeeded();

    fireEvent.dragStart(cards(inbox())[2]); // 拖「丙」
    const target = withGeometry(cards(inbox())[0]); // 「甲」
    dragOverWith(target, 130);
    dropWith(target, 130);

    await waitFor(() =>
      expect(
        cards(inbox()).map((el) => within(el).getByRole("link").textContent)
      ).toEqual(["甲", "丙", "乙"])
    );
    // 落位后指示线清场
    expect(indicatorSlot(inbox())).toBeNull();
  });

  it("指针拖离整墙清指示线;组内移动触发的 dragleave 不清", async () => {
    await renderSeeded();

    fireEvent.dragStart(cards(inbox())[2]);
    dragOverWith(withGeometry(cards(inbox())[0]), 110);
    expect(indicatorSlot(inbox())).toBe(0);

    // 拖离墙外(relatedTarget 不在墙内)
    const wall = document.querySelector(".groups-wall")!;
    dragLeaveTo(wall, document.body);
    expect(indicatorSlot(inbox())).toBeNull();

    // 组间移动(relatedTarget 是墙内元素)不清
    dragOverWith(withGeometry(cards(inbox())[0]), 110);
    dragLeaveTo(inbox(), cards(inbox())[0]);
    expect(indicatorSlot(inbox())).toBe(0);
  });

  it("拖组经过分区不出收藏指示线;拖拽源就地淡化", async () => {
    await renderSeeded();

    const header = inbox().querySelector(".group-header")!;
    fireEvent.dragStart(header);
    expect(inbox()).toHaveAttribute("data-group-dragging", "true");

    fireEvent.dragOver(screen.getByRole("region", { name: "空组" }));
    expect(
      indicatorSlot(screen.getByRole("region", { name: "空组" }))
    ).toBeNull();

    fireEvent.dragEnd(header);
    expect(inbox()).not.toHaveAttribute("data-group-dragging");
  });

  it("拖收藏时源行就地淡化,松手恢复", async () => {
    await renderSeeded();

    const card = cards(inbox())[1];
    fireEvent.dragStart(card);
    expect(card).toHaveAttribute("data-dragging", "true");

    fireEvent.dragEnd(card);
    expect(card).not.toHaveAttribute("data-dragging");
  });
});
