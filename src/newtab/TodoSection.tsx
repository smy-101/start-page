import { Fragment, memo, useRef, useState } from "react";
import type { RefCallback } from "react";
import type { Result, TodoCard, TodoId } from "../domain/types";
import { CARD_W } from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import { TrashIcon } from "./Icon";

type TodoSectionProps = {
  todo: TodoCard;
  /** 画布坐标(ADR-0006):与分组卡同语义,x/y 入库;null 时不定位 */
  placement: CanvasPos | null;
  /** 白板模式:唯一开增删改/改名/拖拽的门禁(ADR-0004);日常态仅勾选开放 */
  whiteboardMode: boolean;
  /** 白板 Pointer 拖拽中且本卡是被拖卡:拖中关位移过渡(同分组卡) */
  dragActive?: boolean;
  /** 画布测量登记(Whiteboard 供给,按 id 缓存的稳定回调) */
  elementRef?: RefCallback<HTMLElement>;
  /** 共享回调(稳定身份):本组件以自身 todo 数据供给 id。 */
  onRename(id: TodoId, title: string): Promise<Result<TodoCard>>;
  onDeleteTodo(id: TodoId): Promise<Result<TodoId>>;
  onAddItem(id: TodoId, text: string): Promise<Result<TodoCard>>;
  onEditItem(
    todoId: TodoId,
    itemId: TodoId,
    text: string
  ): Promise<Result<TodoCard>>;
  onToggleItem(todoId: TodoId, itemId: TodoId): Promise<Result<TodoCard>>;
  onRemoveItem(todoId: TodoId, itemId: TodoId): Promise<Result<TodoCard>>;
  onReorderItems(
    todoId: TodoId,
    itemIds: readonly TodoId[]
  ): Promise<Result<TodoCard>>;
};

/**
 * 待办卡(ADR-0006,todo-card):画布上与分组卡并排的清单卡——
 * 标题 + 可勾选条目;完成项划线沉卡底(顺序由 store 维护,组件纯展示)。
 * 门禁:日常态仅勾选/取消可点(唯一开放的交互);添加/删除/改文本/改名/
 * 卡内拖拽排序只在白板模式。中性配色不用分组色(收藏容器的视觉语言),
 * 定宽 CARD_W 无档位。memo:props 未变时跳过重渲染(同 GroupSection)。
 * 条目排序为 HTML5 DnD(自含实现,与收藏的 useCardDnD 分立——
 * 那是跨组移动的深 module,卡内单容器不背它的形状)。
 */
export const TodoSection = memo(function TodoSection({
  todo,
  placement,
  whiteboardMode,
  dragActive,
  elementRef,
  onRename,
  onDeleteTodo,
  onAddItem,
  onEditItem,
  onToggleItem,
  onRemoveItem,
  onReorderItems,
}: TodoSectionProps) {
  // 标题就地改名:点标题进输入,Enter/失焦提交(空文本由 store 回退「待办」)
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(todo.title);
  // 条目文本就地编辑:Enter/失焦保存(空 = 取消),Esc 取消
  const [editingItemId, setEditingItemId] = useState<TodoId | null>(null);
  const [itemDraft, setItemDraft] = useState("");
  const [addText, setAddText] = useState("");
  // 卡内拖拽排序:被拖条目 id + 插入槽位(渲染指示线;均为本地状态)
  const [dragItemId, setDragItemId] = useState<TodoId | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const undoneCount = todo.items.filter((i) => !i.done).length;

  function startTitleEdit() {
    setTitleDraft(todo.title);
    setEditingTitle(true);
  }

  async function submitTitle() {
    setEditingTitle(false);
    // 空文本交 store 回退「待办」(inline 快改语义,ADR-0006)
    if (titleDraft.trim() !== todo.title) {
      await onRename(todo.id, titleDraft.trim());
    }
  }

  function startItemEdit(itemId: TodoId, text: string) {
    setItemDraft(text);
    setEditingItemId(itemId);
  }

  async function submitItem(itemId: TodoId) {
    setEditingItemId(null);
    const trimmed = itemDraft.trim();
    // 清空 = 放弃修改(不提交空文本)
    if (trimmed && trimmed !== todo.items.find((i) => i.id === itemId)?.text) {
      await onEditItem(todo.id, itemId, trimmed);
    }
  }

  async function submitAdd() {
    const trimmed = addText.trim();
    if (!trimmed) return;
    const result = await onAddItem(todo.id, trimmed);
    if (result.ok) setAddText("");
  }

  /** 悬停行的插入槽:指针在行上/下半判插前/插后(jsdom 行高 0,>0 即下半)。 */
  function insertionIndexAt(el: HTMLElement, clientY: number): number {
    const row = el.closest("li");
    const rows = Array.from(
      el.closest("ul")?.querySelectorAll("li.todo-item") ?? []
    );
    const at = rows.indexOf(row as HTMLElement);
    if (at < 0) return dropIndex ?? 0;
    const rect = (row as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    return clientY <= mid ? at : at + 1;
  }

  function handleDragStart(event: React.DragEvent, itemId: TodoId) {
    draggingRef.current = true;
    setDragItemId(itemId);
    event.dataTransfer?.setData("text/plain", itemId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event: React.DragEvent) {
    if (!draggingRef.current || dragItemId === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    setDropIndex(insertionIndexAt(event.target as HTMLElement, event.clientY));
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const index =
      dropIndex ?? insertionIndexAt(event.target as HTMLElement, event.clientY);
    endDrag();
    if (dragItemId === null || index === null) return;
    const others = todo.items
      .filter((i) => i.id !== dragItemId)
      .map((i) => i.id);
    const insertAt = Math.max(0, Math.min(index, others.length));
    void onReorderItems(todo.id, [
      ...others.slice(0, insertAt),
      dragItemId,
      ...others.slice(insertAt),
    ]);
  }

  function endDrag() {
    draggingRef.current = false;
    setDragItemId(null);
    setDropIndex(null);
  }

  const canvasStyle = placement
    ? { left: placement.x, top: placement.y, width: CARD_W }
    : undefined;

  return (
    <section
      className="todo"
      aria-label={todo.title}
      data-drag-active={dragActive ? "true" : undefined}
      data-dragging-item={dragItemId !== null ? "true" : undefined}
      ref={elementRef}
      style={canvasStyle}
    >
      <header className="todo-header">
        {editingTitle ? (
          <input
            className="todo-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            onBlur={() => void submitTitle()}
            aria-label="待办卡标题"
            autoFocus
            autoComplete="off"
          />
        ) : (
          <h2
            className="todo-title"
            // 白板模式点标题就地改名(日常态纯文本)
            onClick={whiteboardMode ? startTitleEdit : undefined}
          >
            {todo.title}
          </h2>
        )}
        <span className="todo-count" aria-label={`未完成 ${undoneCount} 项`}>
          {undoneCount}
        </span>
        {whiteboardMode && (
          <button
            type="button"
            className="icon-button danger"
            aria-label={`删除待办卡 ${todo.title}`}
            title="删除待办卡"
            onClick={() => void onDeleteTodo(todo.id)}
          >
            <TrashIcon size={14} />
          </button>
        )}
      </header>
      <ul className="todo-list">
        {todo.items.map((item, index) => (
          <Fragment key={item.id}>
            {dropIndex === index && dragItemId !== null && (
              <li className="todo-drop-indicator" aria-hidden="true" />
            )}
            <li
              className="todo-item"
              data-done={item.done ? "true" : undefined}
              draggable={whiteboardMode}
              onDragStart={(event) => handleDragStart(event, item.id)}
              onDragEnd={endDrag}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="checkbox"
                className="todo-check"
                checked={item.done}
                onChange={() => void onToggleItem(todo.id, item.id)}
                aria-label={item.text}
              />
              {editingItemId === item.id ? (
                <input
                  className="todo-text-input"
                  value={itemDraft}
                  onChange={(e) => setItemDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitItem(item.id);
                    if (e.key === "Escape") setEditingItemId(null);
                  }}
                  onBlur={() => void submitItem(item.id)}
                  autoFocus
                  autoComplete="off"
                />
              ) : (
                <span
                  className="todo-text"
                  onClick={
                    whiteboardMode
                      ? () => startItemEdit(item.id, item.text)
                      : undefined
                  }
                >
                  {item.text}
                </span>
              )}
              {whiteboardMode && (
                <button
                  type="button"
                  className="icon-button danger todo-item-delete"
                  aria-label={`删除待办条目 ${item.text}`}
                  title="删除待办条目"
                  onClick={() => void onRemoveItem(todo.id, item.id)}
                >
                  <TrashIcon size={12} />
                </button>
              )}
            </li>
          </Fragment>
        ))}
        {dropIndex === todo.items.length && dragItemId !== null && (
          <li className="todo-drop-indicator" aria-hidden="true" />
        )}
      </ul>
      {todo.items.length === 0 && !whiteboardMode && (
        <p className="todo-empty">暂无待办</p>
      )}
      {whiteboardMode && (
        <input
          className="todo-add"
          type="text"
          placeholder="添加待办…"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitAdd();
          }}
          aria-label="添加待办"
          autoComplete="off"
        />
      )}
    </section>
  );
});
