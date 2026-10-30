import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCardDnD } from "./useCardDnD";
import { INBOX_GROUP_ID } from "../domain/store";
import type { Bookmark } from "../domain/types";

/**
 * useCardDnD 直测(card-dnd-deepen/01):收藏排序拖拽的插入几何、
 * 指示线去抖与 ref 镜像契约。真值来自抽取前 App 上的实测探针
 * (行为冻结:数值逐一对应,见票面)。
 *
 * 事件走手造 React.DragEvent 形状直调 handlers(hook 的公共出口):
 * currentTarget 用真实 li 元素(几何由 getBoundingClientRect mock 供给,
 * 与 DropHint.test 同口径:top=100、height=40、中点 120)。
 */

const G_B = "g-b";

function bm(id: string, groupId: string, order: number): Bookmark {
  return {
    id: `b-${id}`,
    url: `https://${id}.example.com`,
    title: id,
    note: "",
    groupId,
    order,
  };
}

/** 甲乙丙 ∈ 收集箱,X Y ∈ 乙组(与探针同 fixture)。 */
function fullBookmarks(): Bookmark[] {
  return [
    bm("甲", INBOX_GROUP_ID, 0),
    bm("乙", INBOX_GROUP_ID, 1),
    bm("丙", INBOX_GROUP_ID, 2),
    bm("X", G_B, 0),
    bm("Y", G_B, 1),
  ];
}

/** 量出真实几何的卡片元素(jsdom 默认全 0)。 */
function cardEl(top = 100, height = 40): HTMLElement {
  const el = document.createElement("li");
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

type DragEventInit = {
  clientY?: number;
  relatedTarget?: Node | null;
  dataTransfer?: { dropEffect?: string; effectAllowed?: string } | null;
};

/** 手造 React.DragEvent(hook 只读 currentTarget/clientY/relatedTarget/dataTransfer)。 */
function dragEvent(
  currentTarget: HTMLElement,
  init: DragEventInit = {}
): React.DragEvent {
  return {
    currentTarget,
    clientY: init.clientY ?? 0,
    relatedTarget: init.relatedTarget ?? null,
    dataTransfer: init.dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.DragEvent;
}

function setup(bookmarks: Bookmark[] = fullBookmarks()) {
  const onMove = vi.fn();
  const hook = renderHook(
    ({ bookmarks, onMove }) => useCardDnD(bookmarks, onMove),
    { initialProps: { bookmarks, onMove } }
  );
  return { onMove, ...hook };
}

/** 拖 id 起、悬停 targetEl(上半 clientY=110 / 下半 130),返回指示线。 */
function hover(
  result: { current: ReturnType<typeof useCardDnD> },
  dragId: string,
  dragGroup: string,
  targetEl: HTMLElement,
  half: "upper" | "lower"
) {
  act(() => {
    result.current.handlers.onCardDragStart(
      dragEvent(cardEl(), { dataTransfer: {} }),
      `b-${dragId}`,
      dragGroup
    );
  });
  act(() => {
    result.current.handlers.onCardDragOver(
      dragEvent(targetEl, { clientY: half === "upper" ? 110 : 130 }),
      targetEl.dataset.bid!
    );
  });
}

/** 带 id 标记的卡片元素(onCardDragOver 以目标 id 查询)。 */
function targetCard(id: string, top = 100, height = 40): HTMLElement {
  const el = cardEl(top, height);
  el.dataset.bid = id;
  return el;
}

describe("useCardDnD:插入槽位几何(行为冻结真值)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("悬停目标上半:指示线落在目标之前;下半:落在目标之后(拖末项悬首项)", () => {
    const { result } = setup();
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 0,
    });

    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "lower");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 1,
    });
  });

  it("悬停被拖项自身:前后均为原位(上半贴自身前;下半维持既有 p+2 槽位)", () => {
    const { result } = setup();
    // 拖甲悬甲:上半槽 0;下半槽 2(既有行为,疑点记录于票面 Comments)
    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 0,
    });

    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-甲"), "lower");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 2,
    });
  });

  it("拖首项悬后续目标:指示线换算含被拖项占位(上半 0 / 下半 2)", () => {
    const { result } = setup();
    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-乙"), "upper");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 0,
    });

    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-乙"), "lower");
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 2,
    });
  });

  it("跨组悬停:上半落在目标之前(0)、下半落在目标之后(1),无本组占位换算", () => {
    const { result } = setup();
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-X"), "upper");
    expect(result.current.dropHint).toEqual({ groupId: G_B, index: 0 });

    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-X"), "lower");
    expect(result.current.dropHint).toEqual({ groupId: G_B, index: 1 });
  });

  it("搜索过滤视图:落点按完整状态算(不可见项计入下标)", () => {
    // 过滤视图只显示甲、丙,乙被隐藏:悬丙下半的下标仍按全量 [甲乙丙] 算
    const { result } = setup();
    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-丙"), "lower");
    // siblings(去甲)= [乙,丙],悬丙下半 → 渲染槽 3(siblings 下标 2 + 被拖项占位前移;含不可见的乙)
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 3,
    });
  });
});

describe("useCardDnD:落位写回 onMove 三参", () => {
  /** 拖 id 起、在 targetEl 上松手。 */
  function dropOn(
    result: { current: ReturnType<typeof useCardDnD> },
    dragId: string,
    dragGroup: string,
    targetEl: HTMLElement,
    half: "upper" | "lower"
  ) {
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        `b-${dragId}`,
        dragGroup
      );
    });
    act(() => {
      result.current.handlers.onCardDrop(
        dragEvent(targetEl, { clientY: half === "upper" ? 110 : 130 }),
        targetEl.dataset.bid!
      );
    });
  }

  it("悬下半松手:插到目标之后(拖丙悬甲下半 → 下标 1)", () => {
    const { result, onMove } = setup();
    dropOn(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "lower");
    expect(onMove).toHaveBeenCalledWith("b-丙", INBOX_GROUP_ID, 1);
  });

  it("落位下标按完整状态算:过滤视图隐藏乙,悬丙下半仍计入(下标 2)", () => {
    const { result, onMove } = setup();
    dropOn(result, "甲", INBOX_GROUP_ID, targetCard("b-丙"), "lower");
    expect(onMove).toHaveBeenCalledWith("b-甲", INBOX_GROUP_ID, 2);
  });

  it("自悬松手:无操作,onMove 不被调用,指示线清场", () => {
    const { result, onMove } = setup();
    hover(result, "甲", INBOX_GROUP_ID, targetCard("b-甲"), "lower");
    expect(result.current.dropHint).not.toBeNull();
    act(() => {
      result.current.handlers.onCardDrop(
        dragEvent(targetCard("b-甲"), { clientY: 130 }),
        "b-甲"
      );
    });
    expect(onMove).not.toHaveBeenCalled();
    expect(result.current.dropHint).toBeNull();
  });

  it("跨组松手:镜像 moveBookmark 三参(拖丙悬 X 下半 → 乙组下标 1)", () => {
    const { result, onMove } = setup();
    dropOn(result, "丙", INBOX_GROUP_ID, targetCard("b-X"), "lower");
    expect(onMove).toHaveBeenCalledWith("b-丙", G_B, 1);
  });

  it("分区放置:追加到目标组末尾(排除被拖项计长)", () => {
    const { result, onMove } = setup();
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        "b-甲",
        INBOX_GROUP_ID
      );
    });
    act(() => {
      result.current.handlers.onSectionDrop(dragEvent(cardEl()), G_B);
    });
    expect(onMove).toHaveBeenCalledWith("b-甲", G_B, 2);
  });

  it("分区悬停(非卡片):指示线落到组末尾追加槽", () => {
    const { result } = setup();
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        "b-甲",
        INBOX_GROUP_ID
      );
    });
    act(() => {
      result.current.handlers.onSectionDragOver(dragEvent(cardEl()), G_B);
    });
    expect(result.current.dropHint).toEqual({ groupId: G_B, index: 2 });
  });

  it("未拖起就松手/悬停目标不存在:均无写回", () => {
    const { result, onMove } = setup();
    // 无拖拽会话的分区松手
    act(() => {
      result.current.handlers.onSectionDrop(dragEvent(cardEl()), G_B);
    });
    // 目标 id 不在状态里
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        "b-甲",
        INBOX_GROUP_ID
      );
    });
    act(() => {
      result.current.handlers.onCardDrop(
        dragEvent(targetCard("b-ghost"), { clientY: 130 }),
        "b-ghost"
      );
    });
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe("useCardDnD:身份契约(memo 契约的根)", () => {
  it("相同槽位重复悬停:指示线保对象引用;换槽位才出新对象", () => {
    const { result } = setup();
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    const first = result.current.dropHint;
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    expect(result.current.dropHint).toBe(first);

    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "lower");
    expect(result.current.dropHint).not.toBe(first);
    expect(result.current.dropHint).toEqual({
      groupId: INBOX_GROUP_ID,
      index: 1,
    });
  });

  it("handlers 引用稳定:rerender(含新 bookmarks/onMove 实例)不换身份", () => {
    const { result, rerender } = setup();
    const first = result.current.handlers;
    rerender({ bookmarks: fullBookmarks(), onMove: vi.fn() });
    expect(result.current.handlers).toBe(first);
  });

  it("bookmarks 不稳定身份:内容变更随 rerender 生效(ref 镜像最新值)", () => {
    const { result, onMove, rerender } = setup();
    // 新数组实例 + 新增丁(乙组末尾):追加槽应计入新条目
    rerender({ bookmarks: [...fullBookmarks(), bm("丁", G_B, 2)], onMove });
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        "b-甲",
        INBOX_GROUP_ID
      );
    });
    act(() => {
      result.current.handlers.onSectionDragOver(dragEvent(cardEl()), G_B);
    });
    expect(result.current.dropHint).toEqual({ groupId: G_B, index: 3 });
  });

  it("onMove 不稳定身份:落位调用的是最新实例", () => {
    const { result, rerender } = setup();
    const latest = vi.fn();
    rerender({ bookmarks: fullBookmarks(), onMove: latest });
    act(() => {
      result.current.handlers.onCardDragStart(
        dragEvent(cardEl(), { dataTransfer: {} }),
        "b-甲",
        INBOX_GROUP_ID
      );
    });
    act(() => {
      result.current.handlers.onSectionDrop(dragEvent(cardEl()), G_B);
    });
    expect(latest).toHaveBeenCalledWith("b-甲", G_B, 2);
  });

  it("拖离整块看板清指示线;组内/组间移动的 dragleave 不清", () => {
    const { result } = setup();
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    expect(result.current.dropHint).not.toBeNull();

    // 看板容器与卡片:relatedTarget 在容器内 → 不清
    const board = document.createElement("div");
    const card = document.createElement("li");
    board.appendChild(card);
    act(() => {
      result.current.handlers.onBoardDragLeave(
        dragEvent(board, { relatedTarget: card })
      );
    });
    expect(result.current.dropHint).not.toBeNull();

    // relatedTarget 在容器外 → 清
    act(() => {
      result.current.handlers.onBoardDragLeave(
        dragEvent(board, { relatedTarget: document.body })
      );
    });
    expect(result.current.dropHint).toBeNull();
  });

  it("onDragEnd 清场:指示线归零,后续无会话悬停不再写回", () => {
    const { result, onMove } = setup();
    hover(result, "丙", INBOX_GROUP_ID, targetCard("b-甲"), "upper");
    act(() => {
      result.current.handlers.onDragEnd();
    });
    expect(result.current.dropHint).toBeNull();

    // 会话已散:悬停/松手都无写回
    act(() => {
      result.current.handlers.onCardDragOver(
        dragEvent(targetCard("b-甲"), { clientY: 110 }),
        "b-甲"
      );
    });
    act(() => {
      result.current.handlers.onCardDrop(
        dragEvent(targetCard("b-甲"), { clientY: 110 }),
        "b-甲"
      );
    });
    expect(result.current.dropHint).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
});
