import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroupSection } from "./GroupSection";
import { pointerEvent } from "./testUtils";
import type { DragHandlers } from "./useCardDnD";
import type {
  Bookmark,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
} from "../domain/types";

/**
 * 分组卡组件(group-height):组定长高与待办卡定长高(todo-height-archive)
 * 对称——底缘调高拖柄、键盘步进、组头钉住钮切换定长 ↔ 自适应;
 * 折叠时定长失效(只渲染组头);收集箱同样适用(排版旋钮非内容编辑)。
 */

/** 缺省夹具组:「甲组」带一条收藏。 */
function group(partial: Partial<Group> = {}): Group {
  return {
    id: "g-a",
    name: "甲组",
    color: "#e99695",
    order: 1,
    x: 0,
    y: 0,
    ...partial,
  };
}

function bookmark(groupId = "g-a"): Bookmark {
  return {
    id: "b-1",
    url: "https://example.com",
    title: "示例站",
    note: "",
    groupId,
    order: 0,
  };
}

const ok = (value: Group): Result<Group> => ({ ok: true, value });
const deleteOk = (id: GroupId): DeleteGroupResult => ({
  ok: true,
  value: { groupId: id, recycledIds: [] },
});

const handlers: DragHandlers = {
  onCardDragStart: vi.fn(),
  onDragEnd: vi.fn(),
  onSectionDragOver: vi.fn(),
  onSectionDrop: vi.fn(),
  onCardDragOver: vi.fn(),
  onCardDrop: vi.fn(),
  onBoardDragLeave: vi.fn(),
};

function callbacks() {
  return {
    onToggleCollapse: vi.fn(),
    onRename: vi
      .fn()
      .mockImplementation(async (id: GroupId, name: string) =>
        ok(group({ id, name }))
      ),
    onRecolor: vi
      .fn()
      .mockImplementation(async (id: GroupId, color: string) =>
        ok(group({ id, color }))
      ),
    onResizeWidth: vi
      .fn()
      .mockImplementation(async (id: GroupId, width: number) =>
        ok(group({ id, width }))
      ),
    onSetColumns: vi
      .fn()
      .mockImplementation(async (id: GroupId, columns: number) =>
        ok(group({ id, columns }))
      ),
    onResizeHeight: vi
      .fn()
      .mockImplementation(async (id: GroupId, height: number | undefined) =>
        ok(group({ id, height }))
      ),
    onDeleteGroup: vi
      .fn()
      .mockImplementation(async (id: GroupId) => deleteOk(id)),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
}

function renderGroup(
  g = group(),
  opts: {
    whiteboardMode?: boolean;
    collapsed?: boolean;
    bookmarks?: Bookmark[];
  } = {},
  cbs = callbacks()
) {
  const whiteboardMode = opts.whiteboardMode ?? false;
  const collapsed = opts.collapsed ?? false;
  const view = render(
    <GroupSection
      group={g}
      bookmarks={opts.bookmarks ?? [bookmark(g.id)]}
      groups={[g]}
      placement={{ x: 16, y: 32 }}
      collapsed={collapsed}
      whiteboardMode={whiteboardMode}
      resizable={whiteboardMode && !collapsed}
      resizeMaxW={1200}
      dropIndex={null}
      handlers={handlers}
      {...cbs}
    />
  );
  return { view, cbs };
}

describe("GroupSection:组定长高与底缘调高拖柄(group-height)", () => {
  it("定长渲染:height 直读 + data-fixed-height;缺省自适应不带两者", () => {
    const fixed = renderGroup(group({ height: 320 }));
    const el = fixed.view.container.querySelector<HTMLElement>("section.group");
    expect(el).toHaveStyle({ height: "320px" });
    expect(el!.dataset.fixedHeight).toBe("true");

    const auto = renderGroup();
    const plain =
      auto.view.container.querySelector<HTMLElement>("section.group");
    expect(plain!.style.height).toBe("");
    expect(plain!.dataset.fixedHeight).toBeUndefined();
  });

  it("折叠时定长失效:只渲染组头,无 height 样式与标记(展开即恢复)", () => {
    const { view } = renderGroup(group({ height: 320 }), { collapsed: true });
    const el = view.container.querySelector<HTMLElement>("section.group");
    expect(el).toHaveAttribute("data-collapsed", "true");
    expect(el!.style.height).toBe("");
    expect(el!.dataset.fixedHeight).toBeUndefined();
    expect(view.container.querySelector(".group-resize-b")).toBeNull();
    // 钉住钮同样隐藏:折叠时实测高只剩组头(钳落下界),与底柄同门禁
    expect(
      view.container.querySelector("button[title='钉住高度(定长)']")
    ).toBeNull();
  });

  it("底柄门禁:resizable(白板 + 非折叠)才挂载;键盘 ↓/↑ 步进 16px 网格写回", () => {
    // 白板但折叠 → 无底柄(与宽柄同门禁)
    const folded = renderGroup(group({ height: 320 }), {
      whiteboardMode: true,
      collapsed: true,
    });
    expect(folded.view.container.querySelector(".group-resize-b")).toBeNull();

    const { cbs, view } = renderGroup(group({ height: 320 }), {
      whiteboardMode: true,
    });
    const handle = view.container.querySelector<HTMLElement>(".group-resize-b");
    expect(handle).toBeTruthy();
    expect(handle).toHaveAttribute("role", "separator");
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("aria-valuenow", "320");
    expect(handle).toHaveAttribute("aria-valuemin", "176");
    expect(handle).toHaveAttribute("aria-valuemax", "720");
    expect(handle).toHaveAttribute("aria-label", "调整分组 甲组 高度");

    fireEvent.keyDown(handle!, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("g-a", 336);
    // 回流前连按可累计:从本地已提交高 336 续步到 352
    fireEvent.keyDown(handle!, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenLastCalledWith("g-a", 352);
    fireEvent.keyDown(handle!, { key: "ArrowUp" });
    expect(cbs.onResizeHeight).toHaveBeenLastCalledWith("g-a", 336);
  });

  it("自适应组底柄:基数取实测高(jsdom 为 0 → 下界 176);↓ 首步 192;报「自适应」", () => {
    const { cbs, view } = renderGroup(group(), { whiteboardMode: true });
    const handle =
      view.container.querySelector<HTMLElement>(".group-resize-b")!;
    expect(handle).toHaveAttribute("aria-valuenow", "176");
    expect(handle).toHaveAttribute("aria-valuetext", "自适应");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("g-a", 192);
  });

  it("拖拽调高:连续预览、松手 16px 网格吸附;预览钳在界限内", () => {
    const { cbs, view } = renderGroup(group({ height: 320 }), {
      whiteboardMode: true,
    });
    const handle =
      view.container.querySelector<HTMLElement>(".group-resize-b")!;
    const section = view.container.querySelector<HTMLElement>("section.group")!;
    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", { clientY: 100 }));
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientY: 290 }));
    });
    // 拖中:连续预览高 320 + 190 = 510(无网格吸附),徽章回显 px
    expect(section).toHaveStyle({ height: "510px" });
    expect(
      view.container.querySelector<HTMLElement>(".group-resize-badge")
    ).toBeTruthy();
    // 拖过头:预览钳在上界 720
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientY: 900 }));
    });
    expect(section).toHaveStyle({ height: "720px" });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手吸附 16px 网格:720 恰格点,写回 720
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("g-a", 720);
  });
});

describe("GroupSection:钉住/解除定长切换(group-height)", () => {
  it("门禁:仅白板模式挂载;自适应态点击 = 以实测高吸附网格钉住", () => {
    const daily = renderGroup();
    expect(
      daily.view.container.querySelector("button[title='钉住高度(定长)']")
    ).toBeNull();

    const { cbs, view } = renderGroup(group(), { whiteboardMode: true });
    const pin = view.container.querySelector<HTMLButtonElement>(
      "button[title='钉住高度(定长)']"
    )!;
    expect(pin).toBeTruthy();
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    // jsdom 实测高 0 → 基数下界 176(16 网格恰格点)
    fireEvent.click(pin);
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("g-a", 176);
  });

  it("定长态:按钮转为解除;点击写回 undefined 回自适应", () => {
    const { cbs, view } = renderGroup(group({ height: 320 }), {
      whiteboardMode: true,
    });
    const unpin = view.container.querySelector<HTMLButtonElement>(
      "button[title='解除定长(回自适应)']"
    )!;
    expect(unpin).toBeTruthy();
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unpin);
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("g-a", undefined);
  });

  it("收集箱同样适用:编辑/删除对其隐藏,钉住钮不隐藏", () => {
    const { cbs, view } = renderGroup(
      group({ id: "inbox", name: "收集箱", color: "#3b82f6", order: 0 }),
      { whiteboardMode: true }
    );
    expect(
      view.container.querySelector("button[title='编辑分组 收集箱']")
    ).toBeNull();
    const pin = view.container.querySelector<HTMLButtonElement>(
      "button[title='钉住高度(定长)']"
    )!;
    expect(pin).toBeTruthy();
    fireEvent.click(pin);
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("inbox", 176);
  });
});
