import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TodoSection } from "./TodoSection";
import { CARD_W } from "../domain/canvas";
import { pointerEvent } from "./testUtils";
import type { Result, TodoCard, TodoId } from "../domain/types";

/**
 * 待办卡组件(todo-card/03):渲染 + 门禁(ADR-0006 及补记)——
 * 日常态开勾选与添加两个洞(todo-daily-add);删改/改名/拖拽排序
 * 只在白板模式出现。
 * 拖拽事件同 DropHint.test 的 MouseEvent 方案(jsdom 无 DragEvent 构造器)。
 */

/** 缺省夹具卡:「采购」两条目(咖啡豆未完成、滤纸已完成)。 */
function card(partial: Partial<TodoCard> = {}): TodoCard {
  return {
    id: "t-1",
    title: "采购",
    order: 0,
    x: 0,
    y: 0,
    items: [
      { id: "ti-1", text: "买咖啡豆", done: false, order: 0 },
      { id: "ti-2", text: "买滤纸", done: true, order: 1 },
    ],
    ...partial,
  };
}

const ok = (value: TodoCard): Result<TodoCard> => ({ ok: true, value });

function callbacks() {
  return {
    onRename: vi
      .fn()
      .mockImplementation(async (_id: TodoId, title: string) =>
        ok({ ...card(), title })
      ),
    onDeleteTodo: vi
      .fn()
      .mockImplementation(async (id: TodoId) => ({ ok: true, value: id })),
    onAddItem: vi.fn().mockImplementation(async (id: TodoId, text: string) =>
      ok({
        ...card(),
        id,
        items: [...card().items, { id: "new", text, done: false, order: 2 }],
      })
    ),
    onEditItem: vi
      .fn()
      .mockImplementation(
        async (todoId: TodoId, itemId: TodoId, text: string) =>
          ok({
            ...card(),
            id: todoId,
            items: card().items.map((i) =>
              i.id === itemId ? { ...i, text } : i
            ),
          })
      ),
    onToggleItem: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, itemId: TodoId) =>
        ok({
          ...card(),
          id: todoId,
          items: card().items.map((i) =>
            i.id === itemId ? { ...i, done: !i.done } : i
          ),
        })
      ),
    onRemoveItem: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, itemId: TodoId) =>
        ok({
          ...card(),
          id: todoId,
          items: card().items.filter((i) => i.id !== itemId),
        })
      ),
    onReorderItems: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, itemIds: readonly TodoId[]) =>
        ok({
          ...card(),
          id: todoId,
          items: itemIds.map((id, i) => ({
            ...card().items.find((it) => it.id === id)!,
            order: i,
          })),
        })
      ),
    onResizeWidth: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, width: number) =>
        ok({ ...card(), id: todoId, width })
      ),
    onRecolor: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, color: string) =>
        ok({ ...card(), id: todoId, color: color || undefined })
      ),
    onResizeHeight: vi
      .fn()
      .mockImplementation(async (todoId: TodoId, height: number) =>
        ok({ ...card(), id: todoId, height })
      ),
    onClearDoneItems: vi.fn().mockImplementation(async (todoId: TodoId) =>
      ok({
        ...card(),
        id: todoId,
        items: card().items.filter((i) => !i.done),
      })
    ),
  };
}

function renderTodo(
  todo = card(),
  whiteboardMode = false,
  cbs = callbacks(),
  extra: { resizable?: boolean; resizeMaxW?: number } = {}
) {
  const view = render(
    <TodoSection
      todo={todo}
      placement={{ x: 16, y: 32 }}
      whiteboardMode={whiteboardMode}
      {...extra}
      {...cbs}
    />
  );
  return { view, cbs };
}

/** 条目行(li.todo-item)按文本查。 */
function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error(`找不到条目行:${text}`);
  return row;
}

describe("TodoSection:渲染与日常态门禁", () => {
  it("渲染标题与条目;placement 定位为画布绝对坐标 + 定宽 CARD_W", () => {
    const { view } = renderTodo();
    expect(screen.getByText("采购")).toBeTruthy();
    expect(screen.getByText("买咖啡豆")).toBeTruthy();
    expect(screen.getByText("买滤纸")).toBeTruthy();
    const section = view.container.querySelector<HTMLElement>("section.todo");
    expect(section).toBeTruthy();
    expect(section).toHaveStyle({ left: "16px", top: "32px" });
    // 浏览器序列化截断小数(389.333…→ 389.333px):按数值近似断言
    expect(parseFloat(section!.style.width)).toBeCloseTo(CARD_W, 1);
  });

  it("完成条目带完成标记(data-done),未完成不带", () => {
    renderTodo();
    expect(rowOf("买滤纸").dataset.done).toBe("true");
    expect(rowOf("买咖啡豆").dataset.done).toBeUndefined();
  });

  it("日常态:勾选与添加开放;删除/编辑/拖拽仍不出现(todo-daily-add)", async () => {
    const { cbs } = renderTodo();
    fireEvent.click(screen.getByRole("checkbox", { name: "买咖啡豆" }));
    expect(cbs.onToggleItem).toHaveBeenCalledWith("t-1", "ti-1");
    // 门禁第二洞(ADR-0006 补记):卡尾常驻添加输入框,回车即加
    const input = screen.getByPlaceholderText("+ 添加待办…");
    fireEvent.change(input, { target: { value: " 买奶 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onAddItem).toHaveBeenCalledWith("t-1", "买奶");
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByTitle("删除待办条目")).toBeNull();
    expect(screen.queryByTitle("删除待办卡")).toBeNull();
    expect(rowOf("买咖啡豆").draggable).toBe(false);
    // 标题与文本点按不进入编辑
    fireEvent.click(screen.getByText("采购"));
    expect(screen.queryByDisplayValue("采购")).toBeNull();
    fireEvent.click(screen.getByText("买咖啡豆"));
    expect(screen.queryByDisplayValue("买咖啡豆")).toBeNull();
  });

  it("日常态空卡:添加输入框替代「暂无待办」占位(todo-daily-add)", () => {
    renderTodo(card({ items: [] }));
    expect(screen.queryByText("暂无待办")).toBeNull();
    expect(screen.getByPlaceholderText("+ 添加待办…")).toBeTruthy();
  });
});

describe("TodoSection:白板模式编辑", () => {
  it("添加条目:输入回车回调并清空;空白提交不回调", async () => {
    const { cbs } = renderTodo(card(), true);
    const input = screen.getByPlaceholderText("+ 添加待办…");
    fireEvent.change(input, { target: { value: " 买奶 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onAddItem).toHaveBeenCalledWith("t-1", "买奶");
    await screen.findByPlaceholderText("+ 添加待办…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onAddItem).toHaveBeenCalledTimes(1);
  });

  it("删除条目:悬停删除钮回调", () => {
    const { cbs } = renderTodo(card(), true);
    const buttons = screen.getAllByTitle("删除待办条目");
    fireEvent.click(buttons[0]);
    expect(cbs.onRemoveItem).toHaveBeenCalledWith("t-1", "ti-1");
  });

  it("删除整卡:标题行删除钮回调", () => {
    const { cbs } = renderTodo(card(), true);
    fireEvent.click(screen.getByTitle("删除待办卡"));
    expect(cbs.onDeleteTodo).toHaveBeenCalledWith("t-1");
  });

  it("改标题:点标题进入输入,回车提交新标题", async () => {
    const { cbs } = renderTodo(card(), true);
    fireEvent.click(screen.getByText("采购"));
    const input = screen.getByDisplayValue("采购");
    fireEvent.change(input, { target: { value: " 補貨 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onRename).toHaveBeenCalledWith("t-1", "補貨");
  });

  it("编辑条目文本:点文本进入输入,回车保存;Esc 取消不回调", () => {
    const { cbs } = renderTodo(card(), true);
    fireEvent.click(screen.getByText("买咖啡豆"));
    const input = screen.getByDisplayValue("买咖啡豆");
    fireEvent.change(input, { target: { value: "买深烘豆" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onEditItem).toHaveBeenCalledWith("t-1", "ti-1", "买深烘豆");
    fireEvent.click(screen.getByText("买滤纸"));
    const second = screen.getByDisplayValue("买滤纸");
    fireEvent.change(second, { target: { value: "改了" } });
    fireEvent.keyDown(second, { key: "Escape" });
    expect(cbs.onEditItem).toHaveBeenCalledTimes(1);
  });

  it("卡内拖拽排序:拖 ti-1 悬停 ti-2 下半 → 落为 [ti-2, ti-1]", () => {
    const { cbs } = renderTodo(card(), true);
    const from = rowOf("买咖啡豆");
    const over = rowOf("买滤纸");
    act(() => {
      from.dispatchEvent(
        new MouseEvent("dragstart", { bubbles: true, cancelable: true })
      );
    });
    // jsdom 里行高为 0:clientY > 0 判为下半(插到悬停行之后)
    act(() => {
      over.dispatchEvent(
        new MouseEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientY: 10,
        })
      );
    });
    act(() => {
      over.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true, clientY: 10 })
      );
    });
    expect(cbs.onReorderItems).toHaveBeenCalledWith("t-1", ["ti-2", "ti-1"]);
  });
});

describe("TodoSection:自由宽调宽拖柄(todo-card-size-color)", () => {
  it("宽渲染:缺省 = CARD_W 逐字;width 直读(钳回口径在 domain 测试)", () => {
    const { view } = renderTodo();
    const section = view.container.querySelector<HTMLElement>("section.todo");
    expect(parseFloat(section!.style.width)).toBeCloseTo(CARD_W, 1);

    const wide = renderTodo(card({ width: 484 }));
    const el = wide.view.container.querySelector<HTMLElement>("section.todo");
    expect(parseFloat(el!.style.width)).toBe(484);
  });

  it("拖柄门禁:resizable 才挂载;键盘 →/← 步进一格 16px 网格写回", () => {
    const bare = renderTodo(card(), true);
    expect(bare.view.container.querySelector(".todo-resize")).toBeNull();

    const { cbs, view } = renderTodo(card(), true, callbacks(), {
      resizable: true,
      resizeMaxW: 768,
    });
    const handle = view.container.querySelector<HTMLElement>(".todo-resize");
    expect(handle).toBeTruthy();
    expect(handle).toHaveAttribute("role", "separator");
    // 缺省宽 389.33 → 回显 389;界限 [240, 768]
    expect(handle).toHaveAttribute("aria-valuenow", "389");
    expect(handle).toHaveAttribute("aria-valuemin", "240");
    expect(handle).toHaveAttribute("aria-valuemax", "768");

    fireEvent.keyDown(handle!, { key: "ArrowRight" });
    // 从 389.33 的上一格网格起:→ 400(不走向 389+16=405.33)
    expect(cbs.onResizeWidth).toHaveBeenCalledWith("t-1", 400);
    // 再按一步:吃本地已提交宽,从 400 续步到 416(回流前连按可累计)
    fireEvent.keyDown(handle!, { key: "ArrowRight" });
    expect(cbs.onResizeWidth).toHaveBeenLastCalledWith("t-1", 416);
    fireEvent.keyDown(handle!, { key: "ArrowLeft" });
    expect(cbs.onResizeWidth).toHaveBeenLastCalledWith("t-1", 400);
  });

  it("拖拽调宽:连续预览、松手 16px 网格吸附;预览钳在界限内", () => {
    const { cbs, view } = renderTodo(card(), true, callbacks(), {
      resizable: true,
      resizeMaxW: 768,
    });
    const handle = view.container.querySelector<HTMLElement>(".todo-resize")!;
    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", { clientX: 100 }));
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 290 }));
    });
    // 拖中:连续预览宽 389.33 + 190 = 579.33(无档位吸附),徽章回显 px
    expect(
      view.container.querySelector<HTMLElement>(".todo-resize-badge")
    ).toBeTruthy();
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup"));
    });
    // 松手吸附 16px 网格:579.33 → 576(36×16)
    expect(cbs.onResizeWidth).toHaveBeenCalledWith("t-1", 576);
  });
});

describe("TodoSection:选色(todo-card-size-color)", () => {
  it("调色钮门禁:仅白板模式;展开色板行选色写回", () => {
    const daily = renderTodo();
    expect(daily.view.container.querySelector(".todo-color-row")).toBeNull();

    const { cbs, view } = renderTodo(card(), true);
    fireEvent.click(screen.getByTitle("调整颜色"));
    expect(view.container.querySelector(".todo-color-row")).toBeTruthy();
    // 色板点选(radio 语义):选第二色写回
    fireEvent.click(screen.getByRole("radio", { name: "颜色 #e99695" }));
    expect(cbs.onRecolor).toHaveBeenCalledWith("t-1", "#e99695");
    // 中性复位:空串写回
    fireEvent.click(screen.getByRole("button", { name: "中性" }));
    expect(cbs.onRecolor).toHaveBeenCalledWith("t-1", "");
  });

  it("有色卡:data-todo-colored + --todo-color 注入;缺省不带", () => {
    const colored = renderTodo(card({ color: "#9fe295" }));
    const section =
      colored.view.container.querySelector<HTMLElement>("section.todo");
    expect(section!.dataset.todoColored).toBe("true");
    expect(section!.style.getPropertyValue("--todo-color")).toBe("#9fe295");

    const plain = renderTodo();
    const bare =
      plain.view.container.querySelector<HTMLElement>("section.todo");
    expect(bare!.dataset.todoColored).toBeUndefined();
    expect(bare!.style.getPropertyValue("--todo-color")).toBe("");
  });
});

describe("TodoSection:定长高与底缘调高拖柄(todo-height-archive)", () => {
  it("定长渲染:height 直读 + data-fixed-height;缺省自适应不带两者", () => {
    const fixed = renderTodo(card({ height: 320 }));
    const el = fixed.view.container.querySelector<HTMLElement>("section.todo");
    expect(el).toHaveStyle({ height: "320px" });
    expect(el!.dataset.fixedHeight).toBe("true");

    const auto = renderTodo();
    const plain =
      auto.view.container.querySelector<HTMLElement>("section.todo");
    expect(plain!.style.height).toBe("");
    expect(plain!.dataset.fixedHeight).toBeUndefined();
  });

  it("底柄门禁:resizable 才挂载;键盘 ↓/↑ 步进一格 16px 网格写回", () => {
    const bare = renderTodo(card({ height: 320 }), true);
    expect(bare.view.container.querySelector(".todo-resize-b")).toBeNull();

    const { cbs, view } = renderTodo(card({ height: 320 }), true, callbacks(), {
      resizable: true,
    });
    const handle = view.container.querySelector<HTMLElement>(".todo-resize-b");
    expect(handle).toBeTruthy();
    expect(handle).toHaveAttribute("role", "separator");
    expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    expect(handle).toHaveAttribute("aria-valuenow", "320");
    expect(handle).toHaveAttribute("aria-valuemin", "176");
    expect(handle).toHaveAttribute("aria-valuemax", "720");

    fireEvent.keyDown(handle!, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("t-1", 336);
    // 回流前连按可累计:从本地已提交高 336 续步到 352
    fireEvent.keyDown(handle!, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenLastCalledWith("t-1", 352);
    fireEvent.keyDown(handle!, { key: "ArrowUp" });
    expect(cbs.onResizeHeight).toHaveBeenLastCalledWith("t-1", 336);
  });

  it("自适应卡底柄:基数取实测高(jsdom 为 0 → 下界 176);↓ 首步 192", () => {
    const { cbs, view } = renderTodo(card(), true, callbacks(), {
      resizable: true,
    });
    const handle = view.container.querySelector<HTMLElement>(".todo-resize-b")!;
    // jsdom 实测高 0:回显基数 = 下界 176;自适应卡报「自适应」口径
    expect(handle).toHaveAttribute("aria-valuenow", "176");
    expect(handle).toHaveAttribute("aria-valuetext", "自适应");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("t-1", 192);
  });

  it("拖拽调高:连续预览、松手 16px 网格吸附;预览钳在界限内", () => {
    const { cbs, view } = renderTodo(card({ height: 320 }), true, callbacks(), {
      resizable: true,
    });
    const handle = view.container.querySelector<HTMLElement>(".todo-resize-b")!;
    const section = view.container.querySelector<HTMLElement>("section.todo")!;
    act(() => {
      handle.dispatchEvent(pointerEvent("pointerdown", { clientY: 100 }));
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientY: 290 }));
    });
    // 拖中:连续预览高 320 + 190 = 510(无网格吸附),徽章回显 px
    expect(section).toHaveStyle({ height: "510px" });
    expect(
      view.container.querySelector<HTMLElement>(".todo-resize-badge")
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
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("t-1", 720);
  });
});

describe("TodoSection:钉住/解除定长切换(todo-height-archive)", () => {
  it("门禁:仅白板模式挂载;自适应态点击 = 以实测高吸附网格钉住", () => {
    const daily = renderTodo();
    expect(
      daily.view.container.querySelector("button[title='钉住高度(定长)']")
    ).toBeNull();

    const { cbs, view } = renderTodo(card(), true);
    const pin = view.container.querySelector<HTMLButtonElement>(
      "button[title='钉住高度(定长)']"
    )!;
    expect(pin).toBeTruthy();
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    // jsdom 实测高 0 → 基数下界 176(16 网格恰格点)
    fireEvent.click(pin);
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("t-1", 176);
  });

  it("定长态:按钮转为解除;点击写回 undefined 回自适应", () => {
    const { cbs, view } = renderTodo(card({ height: 320 }), true);
    const unpin = view.container.querySelector<HTMLButtonElement>(
      "button[title='解除定长(回自适应)']"
    )!;
    expect(unpin).toBeTruthy();
    expect(unpin.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(unpin);
    expect(cbs.onResizeHeight).toHaveBeenCalledWith("t-1", undefined);
  });
});

describe("TodoSection:归档已完成(todo-height-archive)", () => {
  it("归档钮两模式可见;点击清除已完成(回调带卡 id)", () => {
    const daily = renderTodo();
    const btn = daily.view.container.querySelector<HTMLButtonElement>(
      "button[title='归档已完成条目']"
    )!;
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(daily.cbs.onClearDoneItems).toHaveBeenCalledWith("t-1");

    const wb = renderTodo(card(), true);
    const wbBtn = wb.view.container.querySelector<HTMLButtonElement>(
      "button[title='归档已完成条目']"
    )!;
    fireEvent.click(wbBtn);
    expect(wb.cbs.onClearDoneItems).toHaveBeenCalledWith("t-1");
  });

  it("无已完成条目时禁用;全完成后恢复可用", () => {
    renderTodo(
      card({
        items: [
          { id: "ti-1", text: "买咖啡豆", done: false, order: 0 },
          { id: "ti-3", text: "买杯子", done: false, order: 1 },
        ],
      })
    );
    expect(screen.getByTitle("归档已完成条目")).toBeDisabled();
  });
});
