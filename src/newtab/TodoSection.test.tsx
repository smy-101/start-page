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
  };
}

function renderTodo(todo = card(), whiteboardMode = false, cbs = callbacks()) {
  const view = render(
    <TodoSection
      todo={todo}
      placement={{ x: 16, y: 32 }}
      whiteboardMode={whiteboardMode}
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
    const input = screen.getByPlaceholderText("添加待办…");
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
    expect(screen.getByPlaceholderText("添加待办…")).toBeTruthy();
  });
});

describe("TodoSection:白板模式编辑", () => {
  it("添加条目:输入回车回调并清空;空白提交不回调", async () => {
    const { cbs } = renderTodo(card(), true);
    const input = screen.getByPlaceholderText("添加待办…");
    fireEvent.change(input, { target: { value: " 买奶 " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cbs.onAddItem).toHaveBeenCalledWith("t-1", "买奶");
    await screen.findByPlaceholderText("添加待办…");
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
