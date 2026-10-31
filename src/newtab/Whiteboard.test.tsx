import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Whiteboard } from "./Whiteboard";
import type { WhiteboardProps } from "./Whiteboard";
import { pointerEvent, queryNudge } from "./testUtils";
import type { GroupPositionInput } from "../domain/store";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import { CARD_W } from "../domain/canvas";
import { byOrder } from "../domain/types";
import type { BookmarkState, GroupId, TodoCard, TodoId } from "../domain/types";

/**
 * 白板(board-whiteboard/02):Pointer 拖拽落点吸附、自动整理装箱、
 * 新分组落位、编辑控件随白板模式(board-whiteboard/03 门禁)、画布杀组头原生 DnD;
 * 画布边界三件套(canvas-bounds-align):拖中钳界、对齐辅助线、右缘调宽。
 *
 * jsdom 几何全 0(getBoundingClientRect/offsetHeight):拖拽的抓取
 * 偏移 = 指针坐标,自动整理退化为零高铺开(与迁移共用策略);
 * 量高路径用 Object.defineProperty 给分区卡 mock offsetHeight。
 */

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
  onResizeCanvas: Mock;
  onResizeGroup: Mock;
  onSetGroupColumns: Mock;
  onResizeGroupHeight: Mock;
  onResizeTodoWidth: Mock;
  onRecolorTodo: Mock;
  onResizeTodoHeight: Mock;
  onClearTodoDone: Mock;
  onEnterWhiteboard: Mock;
  onCreateTodo: Mock;
  onAddTodoItem: Mock;
  onToggleTodoItem: Mock;
  onSetTodoPositions: Mock;
  rerender(next: BookmarkState, overrides?: Partial<WhiteboardProps>): void;
};

/** 待办卡夹具:「采购」两条目,画布 (810, 0)。 */
function seedTodo(): TodoCard {
  return {
    id: "t-1",
    title: "采购",
    order: 0,
    x: 810,
    y: 0,
    items: [
      { id: "ti-1", text: "买咖啡豆", done: false, order: 0 },
      { id: "ti-2", text: "买滤纸", done: true, order: 1 },
    ],
  };
}

function renderBoard(
  initial: BookmarkState = seededState(),
  overrides: Partial<WhiteboardProps> = {}
): Board {
  const onSetGroupPositions = vi.fn(async () => ({
    ok: true as const,
    value: [...initial.groups].sort(byOrder),
  }));
  const onResizeCanvas = vi.fn(async () => ({
    ok: true as const,
    value: 1200,
  }));
  const onResizeGroup = vi.fn(async (_id: GroupId, span: number) => ({
    ok: true as const,
    value: {
      id: _id,
      name: "",
      color: "",
      order: 0,
      x: 0,
      y: 0,
      span,
    },
  }));
  const onSetGroupColumns = vi.fn(async (_id: GroupId, columns: number) => ({
    ok: true as const,
    value: {
      id: _id,
      name: "",
      color: "",
      order: 0,
      x: 0,
      y: 0,
      columns,
    },
  }));
  const onResizeGroupHeight = vi.fn(
    async (_id: GroupId, height: number | undefined) => ({
      ok: true as const,
      value: {
        id: _id,
        name: "",
        color: "",
        order: 0,
        x: 0,
        y: 0,
        ...(height !== undefined ? { height } : null),
      },
    })
  );
  const onEnterWhiteboard = vi.fn();
  const todoOk = vi.fn(async () => ({ ok: true as const, value: seedTodo() }));
  const onCreateTodo = todoOk;
  const onRenameTodo = todoOk;
  const onAddTodoItem = todoOk;
  const onEditTodoItem = todoOk;
  const onToggleTodoItem = vi.fn(async () => ({
    ok: true as const,
    value: seedTodo(),
  }));
  const onRemoveTodoItem = todoOk;
  const onReorderTodoItems = todoOk;
  const onDeleteTodo = vi.fn(async (id: TodoId) => ({
    ok: true as const,
    value: id,
  }));
  const onSetTodoPositions = vi.fn(async () => ({
    ok: true as const,
    value: [seedTodo()],
  }));
  const onResizeTodoWidth = vi.fn(async (_id: TodoId, width: number) => ({
    ok: true as const,
    value: { ...seedTodo(), width },
  }));
  const onRecolorTodo = vi.fn(async (_id: TodoId, color: string) => ({
    ok: true as const,
    value: { ...seedTodo(), color },
  }));
  const onResizeTodoHeight = vi.fn(async (_id: TodoId, height: number) => ({
    ok: true as const,
    value: { ...seedTodo(), height },
  }));
  const onClearTodoDone = vi.fn(async () => ({
    ok: true as const,
    value: seedTodo(),
  }));
  // 拖拽回调束:单对象 prop(稳定身份,与 App 经 useCardDnD 供给同形)
  const handlers = {
    onCardDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onSectionDragOver: vi.fn(),
    onSectionDrop: vi.fn(),
    onCardDragOver: vi.fn(),
    onCardDrop: vi.fn(),
    onBoardDragLeave: vi.fn(),
  };
  const props: WhiteboardProps = {
    state: initial,
    groups: [...initial.groups].sort(byOrder),
    searching: false,
    collapsedIds: new Set<GroupId>(),
    whiteboardMode: false,
    onEnterWhiteboard,
    dropHint: null,
    onToggleCollapse: vi.fn(),
    onRenameGroup: vi.fn(),
    onRecolorGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onSetGroupPositions,
    onResizeCanvas,
    onResizeGroup,
    onSetGroupColumns,
    onResizeGroupHeight,
    onRenameTodo,
    onDeleteTodo,
    onAddTodoItem,
    onEditTodoItem,
    onToggleTodoItem,
    onRemoveTodoItem,
    onReorderTodoItems,
    onSetTodoPositions,
    onResizeTodoWidth,
    onRecolorTodo,
    onResizeTodoHeight,
    onClearTodoDone,
    onCreateTodo,
    handlers,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(<Whiteboard {...props} />);
  return {
    onSetGroupPositions,
    onResizeCanvas,
    onResizeGroup,
    onSetGroupColumns,
    onResizeGroupHeight,
    onResizeTodoWidth,
    onRecolorTodo,
    onResizeTodoHeight,
    onClearTodoDone,
    onEnterWhiteboard,
    onCreateTodo,
    onAddTodoItem,
    onToggleTodoItem,
    onSetTodoPositions,
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

describe("白板:Pointer 拖拽与吸附(白板模式内)", () => {
  it("拖动分组卡跟手移动,松手吸附 16px 网格并写回落点;吸附位等持久回流不闪回", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
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
    // 松手:吸附(71→64, 50→48)写回;卡停在吸附位等持久坐标回流(不闪回旧位)
    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: "g-a", x: 64, y: 48 },
    ]);
    expect(groupA).toHaveStyle({ left: "64px", top: "48px" });

    // 持久坐标回流(存储往返):哨兵清场,卡仍在同位,拖拽态退场
    const settled = seededState();
    settled.groups = settled.groups.map((g) =>
      g.id === "g-a" ? { ...g, x: 64, y: 48 } : g
    );
    board.rerender(settled);
    expect(groupA).not.toHaveAttribute("data-drag-active");
    expect(groupA).toHaveStyle({ left: "64px", top: "48px" });
    expect(document.querySelector(".whiteboard-canvas")).not.toHaveAttribute(
      "data-wb-dragging"
    );
  });

  it("拖中实时钳在画布内并吸到右缘辅助线,松手写钳内坐标(canvas-bounds-align)", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const groupA = sectionOf("甲组");

    // 拖到画布外右侧:拖中即钳在右界 1200 − 卡宽(不再先逃逸后弹回)
    dragBy(groupA, { x: 0, y: 0 }, { x: 2997, y: 41 });
    const left = parseFloat(groupA.style.left);
    expect(left).toBeLessThanOrEqual(1200 - CARD_W);
    expect(left).toBeGreaterThanOrEqual(1200 - CARD_W - 1);
    // 卡右缘恰在画布右沿线 → 贯穿整幅的右缘辅助线亮起
    const guide = document.querySelector(".wb-guide-x") as HTMLElement;
    expect(guide).not.toBeNull();
    expect(parseFloat(guide.style.left)).toBe(1200);

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手:对齐轴写精确对齐坐标(floor 810.67 → 810,越界的最终钳回收口在领域层)
    const sent = board.onSetGroupPositions.mock
      .calls[0][0] as GroupPositionInput[];
    expect(sent[0]).toEqual({ id: "g-a", x: 810, y: 48 });
    // 会话清场:辅助线消散
    expect(document.querySelector(".wb-guide-x")).toBeNull();
  });

  it("对齐吸附:拖近甲组左线(4px 内)吸到精确对齐,松手跳网格吸附(405 非格点)", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const groupB = sectionOf("乙组");

    // 乙组 (0,144) 拖到指针 (401,0):x=401 距甲组左线 405 为 4px ≤ 阈值 8,
    // y=0 恰在收集箱顶线 → 两轴同吸
    dragBy(groupB, { x: 0, y: 0 }, { x: 401, y: 0 });
    expect(groupB).toHaveStyle({ left: "405px", top: "0px" });
    // 卡片间辅助线亮起:x 线落在 405(跨被拖卡与甲组并集);y 线在 0
    const guideX = document.querySelector(".wb-guide-x") as HTMLElement;
    expect(parseFloat(guideX.style.left)).toBe(405);
    expect(document.querySelector(".wb-guide-y")).not.toBeNull();

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 对齐轴写精确坐标(网格吸附会让 x 去 400/416——对象吸附优先)
    const sent = board.onSetGroupPositions.mock
      .calls[0][0] as GroupPositionInput[];
    expect(sent[0]).toEqual({ id: "g-b", x: 405, y: 0 });
  });

  it("无对齐时松手仍 16px 网格吸附,辅助线不出场", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const groupB = sectionOf("乙组");

    // (71,50) 距所有候选线均超 8px
    dragBy(groupB, { x: 30, y: 40 }, { x: 101, y: 90 });
    expect(document.querySelector(".wb-guide-x")).toBeNull();
    expect(document.querySelector(".wb-guide-y")).toBeNull();

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    const sent = board.onSetGroupPositions.mock
      .calls[0][0] as GroupPositionInput[];
    expect(sent[0]).toEqual({ id: "g-b", x: 64, y: 48 });
  });

  it("钳回等价也结算:右界吸附写回后哨兵在持久坐标到位时清场", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const groupA = sectionOf("甲组");

    // 拖中已钳在右界并吸右缘线,松手送 810(对齐轴 floor,≤ 右界不被改写)
    dragBy(groupA, { x: 0, y: 0 }, { x: 2997, y: 41 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    expect(groupA).toHaveAttribute("data-drag-active", "true"); // 等回流

    const settled = seededState();
    settled.groups = settled.groups.map((g) =>
      g.id === "g-a" ? { ...g, x: 810, y: 48 } : g
    );
    board.rerender(settled);
    expect(groupA).not.toHaveAttribute("data-drag-active");
    expect(groupA).toHaveStyle({ left: "810px", top: "48px" });
  });

  it("指针按在交互控件上不发起拖拽(链接/按钮照常工作)", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
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
    const board = renderBoard(undefined, { whiteboardMode: true });
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
  it("量高装箱:packCanvas 贪心装箱回坐标(floor 取整),画布高随内容增长", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
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
    const board = renderBoard(state, { whiteboardMode: true });
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
    const board = renderBoard(undefined, { whiteboardMode: true });

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
    ]);
  });

  it("宽画布整理(1760):三组铺前三列,零高铺开随状态宽自适应", () => {
    const state = seededState();
    state.canvasWidth = 1760;
    const board = renderBoard(state, { whiteboardMode: true });

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
    ]);
  });

  it("宽画布整理(1760):第四组进第四列而非第二行", () => {
    const four = seededState();
    four.canvasWidth = 1760;
    four.groups = [
      ...seedGroups(),
      { id: "g-c", name: "丙组", color: "#f0c674", order: 3, x: 0, y: 300 },
    ];
    const board = renderBoard(four, { whiteboardMode: true });

    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));

    expect(board.onSetGroupPositions).toHaveBeenCalledWith([
      { id: INBOX_GROUP_ID, x: 0, y: 0 },
      { id: "g-a", x: 405, y: 0 },
      { id: "g-b", x: 810, y: 0 },
      { id: "g-c", x: 1216, y: 0 },
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

  it("画布宽解析:jsdom 测不出可用宽退默认;钉住的固定宽随状态(高度随测得的内容底边增长)", () => {
    const board = renderBoard();
    withHeight(sectionOf("乙组"), 100); // 乙组 y=144 → 底边 244
    // jsdom 无 RO:重渲染重跑同步量高,把 mock 高度收进状态
    board.rerender(seededState());

    const canvas = document.querySelector(".whiteboard-canvas")!;
    expect(canvas).toHaveStyle({ width: "1200px" });
    expect(canvas).toHaveStyle({ minHeight: "268px" }); // 244 + 底衬 24

    const wide = seededState();
    wide.canvasWidth = 1760;
    board.rerender(wide);
    expect(canvas).toHaveStyle({ width: "1760px" });
  });

  it("画布自动档(schema v5):未钉宽时撑满可用宽(随窗口变化重测),越上限钳回", () => {
    const board = renderBoard();
    const canvas = document.querySelector(".whiteboard-canvas")!;
    // jsdom 测不出(clientWidth 0):退默认宽
    expect(canvas).toHaveStyle({ width: "1200px" });

    // 桩出可用宽 2000 + 派发 resize → 自动档撑满
    const scroller = document.querySelector(".whiteboard-scroll")!;
    Object.defineProperty(scroller, "clientWidth", {
      configurable: true,
      value: 2000,
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(canvas).toHaveStyle({ width: "2000px" });

    // 超上限:钳回 2400
    Object.defineProperty(scroller, "clientWidth", {
      configurable: true,
      value: 9999,
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(canvas).toHaveStyle({ width: "2400px" });

    // 钉住的固定宽优先于自动档
    const pinned = seededState();
    pinned.canvasWidth = 1760;
    board.rerender(pinned);
    expect(canvas).toHaveStyle({ width: "1760px" });
  });

  it("搜索无命中给出空状态(与墙同口径)", () => {
    renderBoard({ ...seededState(), bookmarks: [] }, { searching: true });
    expect(screen.getByText("没有找到匹配的收藏")).toBeInTheDocument();
  });
});

describe("白板:编辑控件与 DnD 分流", () => {
  it("编辑控件随白板模式:组头操作与行内编辑仅白板模式出现", () => {
    const state = seededState();
    const board = renderBoard(state, { whiteboardMode: false });

    expect(
      screen.queryByRole("button", { name: "编辑分组 甲组" })
    ).not.toBeInTheDocument();

    board.rerender(state, { whiteboardMode: true });

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
    renderBoard(undefined, { whiteboardMode: true });

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

describe("白板模式门禁(board-whiteboard/03)", () => {
  it("日常态拖不动:不进拖拽会话、不写落点、位置不动", () => {
    const board = renderBoard(); // 默认 whiteboardMode: false
    const groupA = sectionOf("甲组");

    dragBy(groupA, { x: 30, y: 40 }, { x: 101, y: 90 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });

    expect(groupA).not.toHaveAttribute("data-drag-active");
    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
    expect(groupA).toHaveStyle({ left: "405px", top: "0px" });
  });

  it("日常态拖动意图(位移 >5px)出 nudge;4s 自动消隐", () => {
    vi.useFakeTimers();
    try {
      renderBoard();
      const groupA = sectionOf("甲组");

      // 位移 71/50 超过 5px 阈值 → nudge 引导
      dragBy(groupA, { x: 30, y: 40 }, { x: 101, y: 90 });
      expect(queryNudge()).toBeInTheDocument();
      expect(
        screen.getByText("布局已锁定,进入白板模式后才能拖动分组和待办卡")
      ).toBeInTheDocument();

      // 松手不清引导,由 4s 计时消隐
      act(() => {
        window.dispatchEvent(pointerEvent("pointerup"));
      });
      expect(queryNudge()).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(queryNudge()).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("nudge 一键进入:点「进入白板」回调进入且引导消隐", () => {
    const board = renderBoard();
    dragBy(sectionOf("甲组"), { x: 0, y: 0 }, { x: 30, y: 0 });

    fireEvent.click(
      within(queryNudge()!).getByRole("button", { name: "进入白板" })
    );

    expect(board.onEnterWhiteboard).toHaveBeenCalledTimes(1);
    expect(queryNudge()).not.toBeInTheDocument();
  });

  it("位移不超过 5px 不出 nudge(点击意图不误报;阈值含边界)", () => {
    renderBoard();
    // 位移 (3,4):欧氏距离恰 5px(含边界,不触发)
    dragBy(sectionOf("甲组"), { x: 30, y: 40 }, { x: 33, y: 44 });
    expect(queryNudge()).not.toBeInTheDocument();

    // 再超出一点(5.66px)即触发
    dragBy(sectionOf("甲组"), { x: 30, y: 40 }, { x: 34, y: 44 });
    expect(queryNudge()).toBeInTheDocument();
  });

  it("按在交互控件上移动不算拖动意图", () => {
    renderBoard();
    const toggle = within(sectionOf("甲组")).getByRole("button", {
      name: "折叠分组 甲组",
    });

    act(() => {
      toggle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 60, clientY: 0 })
      );
    });

    expect(queryNudge()).not.toBeInTheDocument();
  });

  it("搜索过滤态:日常态意图不出 nudge,白板模式内也拖不动", () => {
    // 日常 + 搜索:连拖动意图都不记(过滤态坐标无意义)
    const daily = renderBoard(undefined, { searching: true });
    dragBy(sectionOf("甲组"), { x: 0, y: 0 }, { x: 60, y: 60 });
    expect(queryNudge()).not.toBeInTheDocument();

    // 白板模式 + 搜索:拖拽会话不发起,不写落点
    daily.rerender(seededState(), { whiteboardMode: true, searching: true });
    dragBy(sectionOf("甲组"), { x: 30, y: 40 }, { x: 101, y: 90 });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    expect(daily.onSetGroupPositions).not.toHaveBeenCalled();
    expect(sectionOf("甲组")).not.toHaveAttribute("data-drag-active");
  });

  it("工具行门禁:自动整理仅白板模式出现;搜索中禁用", () => {
    const board = renderBoard();
    expect(
      screen.queryByRole("button", { name: "自动整理" })
    ).not.toBeInTheDocument();

    board.rerender(seededState(), { whiteboardMode: true });
    const pack = screen.getByRole("button", { name: "自动整理" });
    expect(pack).toBeEnabled();

    board.rerender(seededState(), {
      whiteboardMode: true,
      searching: true,
    });
    expect(screen.getByRole("button", { name: "自动整理" })).toBeDisabled();
  });
});

describe("右缘调宽拖柄(canvas-bounds-align)", () => {
  function resizeHandle(): HTMLElement {
    return screen.getByRole("separator", { name: "调整画布宽度" });
  }

  it("门禁:仅白板模式且非搜索时出现(日常态/搜索态不可见)", () => {
    const board = renderBoard();
    expect(
      screen.queryByRole("separator", { name: "调整画布宽度" })
    ).not.toBeInTheDocument();

    board.rerender(seededState(), { whiteboardMode: true });
    expect(resizeHandle()).toBeInTheDocument();

    board.rerender(seededState(), { whiteboardMode: true, searching: true });
    expect(
      screen.queryByRole("separator", { name: "调整画布宽度" })
    ).not.toBeInTheDocument();
  });

  it("拖柄拖动实时预览宽度,松手 16px 吸附后写回", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = resizeHandle();
    const canvas = document.querySelector(".whiteboard-canvas")!;

    // jsdom 画布 rect 全 0:预览宽 = 指针 clientX(拖到 1763 → 预览 1763)
    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 1200, clientY: 30 })
      );
    });
    expect(canvas).toHaveAttribute("data-wb-resizing", "true");
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 1763, clientY: 30 })
      );
    });
    expect(canvas).toHaveStyle({ width: "1763px" });
    // 调宽读数回显
    expect(screen.getByText("1763 px")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手:吸附 16px 网格(1763 → 1760)写回,预览清场
    expect(board.onResizeCanvas).toHaveBeenCalledWith(1760);
    expect(canvas).not.toHaveAttribute("data-wb-resizing");
  });

  it("拖柄钳界:预览不越 [720, 2400],松手送出钳内值", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = resizeHandle();
    const canvas = document.querySelector(".whiteboard-canvas")!;

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 1200, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 9999, clientY: 0 })
      );
    });
    expect(canvas).toHaveStyle({ width: "2400px" });

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    expect(board.onResizeCanvas).toHaveBeenCalledWith(2400);
  });

  it("键盘:←/→ 按 16px 步进写回;锁定态不可聚焦", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = resizeHandle();

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(board.onResizeCanvas).toHaveBeenCalledWith(1216);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(board.onResizeCanvas).toHaveBeenCalledWith(1184);
  });

  it("指针取消:只清预览不写回", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = resizeHandle();
    const canvas = document.querySelector(".whiteboard-canvas")!;

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 1200, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 1760, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel"));
    });

    expect(board.onResizeCanvas).not.toHaveBeenCalled();
    expect(canvas).not.toHaveAttribute("data-wb-resizing");
    expect(canvas).toHaveStyle({ width: "1200px" });
  });

  it("调宽不劫持分组拖拽:拖柄 pointerdown 不发起分组拖拽会话", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = resizeHandle();

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 1200, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 1300, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });

    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
    expect(sectionOf("甲组")).toHaveStyle({ left: "405px", top: "0px" });
  });
});

describe("组右缘调宽拖柄(group-width-tint)", () => {
  function groupHandle(name: string): HTMLElement {
    return screen.getByRole("separator", { name: `调整分组 ${name} 宽度` });
  }

  it("门禁:仅白板模式且非搜索、非折叠时出现;收集箱同样可调", () => {
    const board = renderBoard();
    expect(
      screen.queryByRole("separator", { name: "调整分组 甲组 宽度" })
    ).not.toBeInTheDocument();

    board.rerender(seededState(), { whiteboardMode: true });
    expect(groupHandle("甲组")).toBeInTheDocument();
    expect(groupHandle("收集箱")).toBeInTheDocument();

    // 搜索态锁定:临时展开也无可调宽入口
    board.rerender(seededState(), { whiteboardMode: true, searching: true });
    expect(
      screen.queryByRole("separator", { name: "调整分组 甲组 宽度" })
    ).not.toBeInTheDocument();

    // 折叠组仅剩列头,无拖柄
    board.rerender(seededState(), {
      whiteboardMode: true,
      collapsedIds: new Set<GroupId>(["g-a"]),
    });
    expect(
      screen.queryByRole("separator", { name: "调整分组 甲组 宽度" })
    ).not.toBeInTheDocument();
  });

  it("组宽随档位推导入渲染;拖柄拖动预览,松手吸附档位写回", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = groupHandle("甲组");
    const groupA = sectionOf("甲组");

    // 缺省 = 1 = CARD_W(存量宽行观感)
    expect(parseFloat(groupA.style.width)).toBeCloseTo(CARD_W, 5);

    // jsdom 几何全 0 无碍:拖柄会话 delta 制(起点宽 + 指针位移)
    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 100, clientY: 30 })
      );
    });
    expect(groupA).toHaveAttribute("data-resizing", "true");
    // 拖宽 300 → 预览 ≈ 689.33(clamp 界内),最近档位 = 3(W(3)=602)
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 400, clientY: 30 })
      );
    });
    expect(parseFloat(groupA.style.width)).toBeCloseTo(CARD_W + 300, 5);
    expect(screen.getByText("宽 3 列")).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手:吸附档位写回 3;已提交宽留到持久回流再清(不闪回旧宽)
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 3);
    expect(groupA).not.toHaveAttribute("data-resizing");
    expect(parseFloat(groupA.style.width)).toBe(602);

    // 持久档位回流:哨兵清场,组宽保持推导值
    const settled = seededState();
    settled.groups = settled.groups.map((g) =>
      g.id === "g-a" ? { ...g, span: 3 } : g
    );
    board.rerender(settled);
    expect(parseFloat(groupA.style.width)).toBe(602);
  });

  it("拖柄钳界:预览不越 [W(1), W(最大档)];画布窄时上界收窄", () => {
    // 画布钉 720:最大档 3(W(4)=792 > 720)
    const narrow = seededState();
    narrow.canvasWidth = 720;
    const board = renderBoard(narrow, { whiteboardMode: true });
    const handle = groupHandle("甲组");

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 9999, clientY: 0 })
      );
    });
    // 预览钳在 W(3)=602,松手吸附 3 档
    expect(parseFloat(sectionOf("甲组").style.width)).toBe(602);
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 3);
  });

  it("键盘:←/→ 步进一档写回;日常态无拖柄不可聚焦", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = groupHandle("甲组");

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 2);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 1);
  });

  it("指针取消:只清预览不写回", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = groupHandle("甲组");

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 0, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 300, clientY: 0 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointercancel"));
    });

    expect(board.onResizeGroup).not.toHaveBeenCalled();
    expect(parseFloat(sectionOf("甲组").style.width)).toBeCloseTo(CARD_W, 5);
  });

  it("调宽不劫持分组拖拽:拖柄 pointerdown 不发起分组移动会话", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = groupHandle("甲组");

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 100, clientY: 30 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 200, clientY: 30 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });

    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
  });

  it("清单式组(span 4, columns 1):宽组单列拉满;拖窄徽标注明一行条数", () => {
    const listed = seededState();
    listed.groups = listed.groups.map((g) =>
      g.id === "g-a" ? { ...g, span: 4, columns: 1 } : g
    );
    // 甲组得有收藏才渲染网格(空组只有占位文案)
    listed.bookmarks = [
      {
        id: "b-a1",
        url: "https://a1.example.com",
        title: "甲一",
        note: "",
        groupId: "g-a",
        order: 0,
      },
    ];
    const board = renderBoard(listed, { whiteboardMode: true });
    const groupA = sectionOf("甲组");

    // W(4)=792 宽组;网格单列模板(条目拉满整行)
    expect(parseFloat(groupA.style.width)).toBe(792);
    const grid = groupA.querySelector(".group-grid") as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe(
      "repeat(1, minmax(184px, 1fr))"
    );

    // 拖窄预览:cells 不随档位升(清单式保持 1),徽标同时报档位与条数
    const handle = groupHandle("甲组");
    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 100, clientY: 30 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: -50, clientY: 30 })
      );
    });
    expect(screen.getByText("宽 3 列 · 一行 1 条")).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 3);
  });

  it("拖拽钳界按各组宽:两列组拖到右缘外钳在 1200 − 412", () => {
    const wide = seededState();
    wide.groups = wide.groups.map((g) =>
      g.id === "g-a" ? { ...g, columns: 2 } : g
    );
    renderBoard(wide, { whiteboardMode: true });
    const groupA = sectionOf("甲组");

    dragBy(groupA, { x: 0, y: 0 }, { x: 2997, y: 41 });

    const left = parseFloat(groupA.style.left);
    expect(left).toBeLessThanOrEqual(1200 - 412);
    expect(left).toBeGreaterThanOrEqual(1200 - 412 - 1);
  });
});

describe("组右缘调宽拖柄:回流哨兵的钳回分歧(group-span-decouple)", () => {
  it("store 钳回不同档位(窄画布降档)时本地已提交宽解除,采纳持久值", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    const handle = screen.getByRole("separator", {
      name: "调整分组 甲组 宽度",
    });
    const groupA = sectionOf("甲组");

    act(() => {
      handle.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 100, clientY: 30 })
      );
    });
    act(() => {
      window.dispatchEvent(
        pointerEvent("pointermove", { clientX: 400, clientY: 30 })
      );
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 请求 3 档(W(3)=602),但 store 画布更窄只给了 2 档
    expect(board.onResizeGroup).toHaveBeenCalledWith("g-a", 3);
    expect(parseFloat(groupA.style.width)).toBe(602);

    const clamped = seededState();
    clamped.groups = clamped.groups.map((g) =>
      g.id === "g-a" ? { ...g, span: 2 } : g
    );
    board.rerender(clamped);
    // 哨兵解除:渲染采纳持久 2 档宽,不再卡在 602
    expect(parseFloat(groupA.style.width)).toBe(412);
  });
});

describe("白板:待办卡集成(todo-card/04)", () => {
  function stateWithTodo(): BookmarkState {
    return { ...seededState(), todos: [seedTodo()] };
  }

  it("待办卡按存储宽渲染(todo-card-size-color 自由宽):缺省 CARD_W,width 直读", () => {
    const board = renderBoard(stateWithTodo());
    const todo = document.querySelector<HTMLElement>("section.todo")!;
    expect(parseFloat(todo.style.width)).toBeCloseTo(CARD_W, 1);

    board.rerender({
      ...seededState(),
      todos: [{ ...seedTodo(), width: 674 }],
    });
    const widened = document.querySelector<HTMLElement>("section.todo")!;
    expect(parseFloat(widened.style.width)).toBe(674);
  });

  it("调宽拖柄与选色入口门禁:白板模式挂载,透传到 TodoSection;搜索态卸下", () => {
    // 日常态:无拖柄无调色钮
    renderBoard(stateWithTodo());
    expect(document.querySelector(".todo-resize")).toBeNull();
    expect(screen.queryByTitle("调整颜色")).toBeNull();

    const board = renderBoard(stateWithTodo(), { whiteboardMode: true });
    const handle = document.querySelector<HTMLElement>(".todo-resize")!;
    expect(handle).toBeTruthy();
    expect(handle).toHaveAttribute("aria-label", "调整待办卡 采购 宽度");
    // 键盘步进接线:→ 一格 16px 网格(389.33 → 400)写回 onResizeTodoWidth
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(board.onResizeTodoWidth).toHaveBeenCalledWith("t-1", 400);
    // 选色接线:展开色板选色写回 onRecolorTodo
    fireEvent.click(screen.getByTitle("调整颜色"));
    fireEvent.click(screen.getByRole("radio", { name: "颜色 #9fe295" }));
    expect(board.onRecolorTodo).toHaveBeenCalledWith("t-1", "#9fe295");

    board.rerender(stateWithTodo(), { searching: true });
    expect(document.querySelector(".todo-resize")).toBeNull();
  });

  it("待办卡渲染在画布,坐标来自存储;日常态勾选与添加透传、无「新建待办」入口", () => {
    const board = renderBoard(stateWithTodo());
    const todo = document.querySelector("section.todo");
    expect(todo).toBeTruthy();
    expect(todo).toHaveStyle({ left: "810px", top: "0px" });
    expect(screen.queryByRole("button", { name: "新建待办" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "买咖啡豆" }));
    expect(board.onToggleTodoItem).toHaveBeenCalledWith("t-1", "ti-1");
    // 门禁第二洞(todo-daily-add):日常态卡尾常驻添加行,回车走通接线
    const add = screen.getByPlaceholderText("+ 添加待办…");
    fireEvent.change(add, { target: { value: "买奶" } });
    fireEvent.keyDown(add, { key: "Enter" });
    expect(board.onAddTodoItem).toHaveBeenCalledWith("t-1", "买奶");
  });

  it("白板模式:工具行「新建待办」入口;搜索过滤态禁用", () => {
    const board = renderBoard(undefined, { whiteboardMode: true });
    fireEvent.click(screen.getByRole("button", { name: "新建待办" }));
    expect(board.onCreateTodo).toHaveBeenCalledTimes(1);
    board.rerender(seededState(), { searching: true });
    expect(screen.getByRole("button", { name: "新建待办" })).toBeDisabled();
  });

  it("拖拽待办卡:松手吸附网格写回 onSetTodoPositions,不惊动分组落点", () => {
    const board = renderBoard(stateWithTodo(), { whiteboardMode: true });
    const todo = document.querySelector<HTMLElement>("section.todo")!;
    dragBy(todo, { x: 30, y: 40 }, { x: 101, y: 90 });
    expect(todo).toHaveAttribute("data-drag-active", "true");
    expect(todo).toHaveStyle({ left: "71px", top: "50px" });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 71→64、50→48(16px 网格吸附)
    expect(board.onSetTodoPositions).toHaveBeenCalledWith([
      { id: "t-1", x: 64, y: 48 },
    ]);
    expect(board.onSetGroupPositions).not.toHaveBeenCalled();
  });

  it("日常态拖待办:同分组门禁——出 nudge 引导,不写落点", () => {
    const board = renderBoard(stateWithTodo());
    const todo = document.querySelector<HTMLElement>("section.todo")!;
    dragBy(todo, { x: 10, y: 10 }, { x: 40, y: 40 });
    expect(queryNudge()).toBeTruthy();
    expect(board.onSetTodoPositions).not.toHaveBeenCalled();
  });

  it("自动整理:待办与分组同批装箱,各自批量写回", () => {
    const board = renderBoard(stateWithTodo(), { whiteboardMode: true });
    withHeight(sectionOf("收集箱"), 100);
    withHeight(sectionOf("甲组"), 200);
    withHeight(sectionOf("乙组"), 100);
    withHeight(document.querySelector<HTMLElement>("section.todo")!, 120);
    fireEvent.click(screen.getByRole("button", { name: "自动整理" }));
    expect(board.onSetGroupPositions).toHaveBeenCalledTimes(1);
    const groupBatch = board.onSetGroupPositions.mock.calls[0][0];
    expect(groupBatch).toHaveLength(3);
    expect(board.onSetTodoPositions).toHaveBeenCalledTimes(1);
    const todoBatch = board.onSetTodoPositions.mock.calls[0][0];
    expect(todoBatch).toHaveLength(1);
  });

  it("搜索过滤态(todos 已被上游置空):不渲染待办卡", () => {
    renderBoard({ ...seededState(), todos: [] }, { searching: true });
    expect(document.querySelector("section.todo")).toBeNull();
  });
});
