import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Whiteboard } from "./Whiteboard";
import type { WhiteboardProps } from "./Whiteboard";
import type { GroupPositionInput } from "../domain/store";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import { byOrder } from "../domain/types";
import type { BookmarkState, GroupId } from "../domain/types";

/**
 * 白板(board-whiteboard/02):Pointer 拖拽落点吸附、自动整理装箱、
 * 新分组落位、编辑控件随 editMode、画布杀组头原生 DnD。
 *
 * jsdom 几何全 0(getBoundingClientRect/offsetHeight):拖拽的抓取
 * 偏移 = 指针坐标,自动整理退化为零高铺开(与迁移共用策略);
 * 量高路径用 Object.defineProperty 给分区卡 mock offsetHeight。
 */

/** 带 Pointer props 的合成事件(jsdom 30 有 PointerEvent 构造器)。 */
function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  opts: { clientX?: number; clientY?: number; button?: number } = {}
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...opts,
  });
}

function seedGroups() {
  return [
    {
      id: INBOX_GROUP_ID,
      name: "收集箱",
      color: "#3b82f6",
      order: 0,
      x: 0,
      y: 0,
    },
    { id: "g-a", name: "甲组", color: "#e99695", order: 1, x: 405, y: 0 },
    { id: "g-b", name: "乙组", color: "#81a2be", order: 2, x: 0, y: 144 },
  ];
}

function seededState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: seedGroups(),
    bookmarks: ["一", "二"].map((title, order) => ({
      id: `b-${title}`,
      url: `https://${title}.example.com`,
      title,
      note: "",
      groupId: INBOX_GROUP_ID,
      order,
    })),
  };
}

type Board = {
  onSetGroupPositions: Mock;
  rerender(next: BookmarkState, overrides?: Partial<WhiteboardProps>): void;
};

function renderBoard(
  initial: BookmarkState = seededState(),
  overrides: Partial<WhiteboardProps> = {}
): Board {
  const onSetGroupPositions = vi.fn(async () => ({
    ok: true as const,
    value: [...initial.groups].sort(byOrder),
  }));
  const props: WhiteboardProps = {
    state: initial,
    groups: [...initial.groups].sort(byOrder),
    searching: false,
    collapsedIds: new Set<GroupId>(),
    editMode: false,
    dropHint: null,
    onToggleCollapse: vi.fn(),
    onRenameGroup: vi.fn(),
    onRecolorGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSetGroupPositions,
    onCardDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onSectionDragOver: vi.fn(),
    onSectionDrop: vi.fn(),
    onCardDragOver: vi.fn(),
    onCardDrop: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(<Whiteboard {...props} />);
  return {
    onSetGroupPositions,
    rerender(next, extra) {
      view.rerender(
        <Whiteboard
          {...props}
          {...extra}
          state={next}
          groups={[...next.groups].sort(byOrder)}
        />
      );
    },
  };
}

function sectionOf(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

/** 给分区卡 mock 量高(自动整理的装箱路径)。 */
function withHeight(el: HTMLElement, height: number): void {
  Object.defineProperty(el, "offsetHeight", {
    get: () => height,
    configurable: true,
  });
}

function dragBy(
  section: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number }
): void {
  act(() => {
    section.dispatchEvent(
      pointerEvent("pointerdown", { clientX: from.x, clientY: from.y })
    );
  });
  act(() => {
    window.dispatchEvent(
      pointerEvent("pointermove", { clientX: to.x, clientY: to.y })
    );
  });
}

describe("白板:Pointer 拖拽与吸附", () => {
  it("拖动分组卡跟手移动,松手吸附 16px 网格并写回落点", () => {
    const board = renderBoard();
    const groupA = sectionOf("甲组");

    // jsdom 几何全 0:抓取偏移 = 指针坐标;画布原点也在 0
    dragBy(groupA, { x: 30, y: 40 }, { x: 101, y: 90 });
    // 拖中:被拖卡跟手(101−30, 90−40),标记 drag-active,画布进拖拽态
    expect(groupA).toHaveAttribute("data-drag-active", "true");
    expect(groupA).toHaveStyle({ left: "71px", top: "50px" });
    expect(document.querySelector(".whiteboard-canvas")).toHaveAttribute(
      "data-wb-dragging",
      "true"
    );

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手:吸附(71→64, 50→48)写回;本地会话清场回到持久坐标
    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: "g-a", x: 64, y: 48 },
    ]);
    expect(groupA).not.toHaveAttribute("data-drag-active");
    expect(groupA).toHaveStyle({ left: "405px", top: "0px" });
  });

  it("吸附后的越右界坐标由领域层钳回收口(组件只送吸附值)", () => {
    const board = renderBoard();
    const groupA = sectionOf("甲组");

    // 拖到画布外右侧:吸附值(2992, 48)超出右界 810.67,原样送出
    dragBy(groupA, { x: 0, y: 0 }, { x: 2997, y: 41 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    const sent = board.onSetGroupPositions.mock
      .calls[0][0] as GroupPositionInput[];
    expect(sent[0]).toEqual({ id: "g-a", x: 2992, y: 48 });
  });

  it("指针按在交互控件上不发起拖拽(链接/按钮照常工作)", () => {
    const board = renderBoard();
    const toggle = within(sectionOf("甲组")).getByRole("button", {
      name: "折叠分组 甲组",
    });

    act(() => {
      toggle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 30, clientY: 40 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 101, clientY: 90 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });

    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
    expect(sectionOf("甲组")).toHaveStyle({ left: "405px", top: "0px" });
  });

  it("指针取消(切窗/触控打断)只清会话,不写落点", () => {
    const board = renderBoard();
    const groupA = sectionOf("甲组");

    dragBy(groupA, { x: 30, y: 40 }, { x: 101, y: 90 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel"));
    });

    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
    expect(groupA).not.toHaveAttribute("data-drag-active");
  });
});

describe("白板:自动整理", () => {
  it("量高装箱:planWall 贪心装箱回坐标(floor 取整),画布高随内容增长", () => {
    const board = renderBoard();
    // 三卡同高 100,第四组(乙组)200 高:装箱后乙组进首列第二行
    withHeight(sectionOf("收集箱"), 100);
    withHeight(sectionOf("甲组"), 100);
    withHeight(sectionOf("乙组"), 200);

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    expect(board.onSetGroupPositions).toHaveBeenCalledTimes(1);
    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
    ]);
  });

  it("量高装箱:最矮列优先,第二行落位正确", () => {
    const state = seededState();
    state.groups = [
      ...seedGroups(),
      { id: "g-c", name: "丙组", color: "#f0c674", order: 3, x: 405, y: 300 },
    ];
    const board = renderBoard(state);
    withHeight(sectionOf("收集箱"), 100);
    withHeight(sectionOf("甲组"), 100);
    withHeight(sectionOf("乙组"), 100);
    withHeight(sectionOf("丙组"), 100);

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    // 四卡同高:前三张铺满三列,第四张(丙组,order 最后)回最矮列首列第二行
    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
      { id: "g-c", x: 0, y: 116 }, // 100 + gap 16
    ]);
  });

  it("测不出高度(jsdom 恒 0)退化零高铺开:与迁移共用 spreadPositions", () => {
    const board = renderBoard();

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
    ]);
  });
});

describe("白板:落位与渲染", () => {
  it("无坐标的分组(运行时损坏防御)落画布底部追加位", () => {
    const state = seededState();
    state.groups = [
      ...seedGroups(),
      { id: "g-new", name: "新组", color: "#9fe295", order: 3, x: NaN, y: NaN },
    ];
    renderBoard(state);

    // 追加位:现有分组推算底部 max(0+48, 0+48, 144+48) = 192
    const added = sectionOf("新组");
    expect(added).toHaveStyle({ left: "0px", top: "192px" });
    expect(screen.getByRole("region", { name: "收集箱" })).toHaveStyle({
      left: "0px",
      top: "0px",
    });
  });

  it("画布固定 1200px 宽;高度随测得的内容底边增长", () => {
    const board = renderBoard();
    withHeight(sectionOf("乙组"), 100); // 乙组 y=144 → 底边 244
    // jsdom 无 RO:重渲染重跑同步量高,把 mock 高度收进状态
    board.rerender(seededState());

    const canvas = document.querySelector(".whiteboard-canvas")!;
    expect(canvas).toHaveStyle({ width: "1200px" });
    expect(canvas).toHaveStyle({ minHeight: "268px" }); // 244 + 底衬 24
  });

  it("搜索无命中给出空状态(与墙同口径)", () => {
    renderBoard({ ...seededState(), bookmarks: [] }, { searching: true });
    expect(screen.getByText("没有找到匹配的收藏")).toBeInTheDocument();
  });
});

describe("白板:编辑控件与 DnD 分流", () => {
  it("编辑控件随 editMode:组头操作与行内编辑仅编辑模式出现", () => {
    const state = seededState();
    const board = renderBoard(state, { editMode: false });

    expect(
      screen.queryByRole("button", { name: "编辑分组 甲组" })
    ).not.toBeInTheDocument();

    board.rerender(state, { editMode: true });

    expect(
      screen.getByRole("button", { name: "编辑分组 甲组" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "删除分组 甲组" })
    ).toBeInTheDocument();
    const row = within(sectionOf("收集箱")).getAllByRole("listitem")[0];
    expect(
      within(row).getByRole("button", { name: "编辑" })
    ).toBeInTheDocument();
  });

  it("组头原生 dragstart 被画布拦下;收藏卡的组内排序 DnD 放行", () => {
    renderBoard(undefined, { editMode: true });

    // 组头:preventDefault → fireEvent 返回 false,且 App 侧回调不触发
    const header = sectionOf("甲组").querySelector(".group-header")!;
    expect(fireEvent.dragStart(header)).toBe(false);

    // 收藏卡:不被拦,卡片自身 onDragStart(App 的收藏拖拽状态)照常触发
    const card = within(sectionOf("收集箱"))
      .getAllByRole("listitem")
      .find((el) => el.classList.contains("card"))!;
    expect(fireEvent.dragStart(card)).toBe(true);
  });
});
