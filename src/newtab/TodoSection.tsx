import { Fragment, memo, useRef, useState } from "react";
import type { CSSProperties, RefCallback } from "react";
import type { Result, TodoCard, TodoId } from "../domain/types";
import {
  TODO_H_MAX,
  TODO_H_MIN,
  TODO_W_MIN,
  todoWidthOf,
} from "../domain/canvas";
import type { CanvasPos } from "../domain/canvas";
import {
  ArchiveIcon,
  PaletteIcon,
  PinIcon,
  PinOffIcon,
  TrashIcon,
} from "./Icon";
import { ColorSwatches } from "./ColorSwatches";
import { useAxisResize } from "./useAxisResize";

type TodoSectionProps = {
  todo: TodoCard;
  /** 画布坐标(ADR-0006):与分组卡同语义,x/y 入库;null 时不定位 */
  placement: CanvasPos | null;
  /** 白板模式:开删改/改名/拖拽的门禁(ADR-0004);日常态开勾选与添加两洞 */
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
  /** 卡右缘调宽拖柄可见(todo-card-size-color):白板模式且非搜索 */
  resizable?: boolean;
  /** 调宽上界(px,随画布宽收窄):Whiteboard 供给 min(TODO_W_MAX, 画布宽) */
  resizeMaxW?: number;
  /** 待办卡宽写回(拖柄松手/键盘步进;store 界限钳回收口) */
  onResizeWidth(id: TodoId, width: number): Promise<Result<TodoCard>>;
  /** 待办卡换色(空串 = 复位中性,store 收口) */
  onRecolor(id: TodoId, color: string): Promise<Result<TodoCard>>;
  /** 待办卡定长高写回(底柄松手/键盘步进/钉住切换;store 界限钳回收口;
   * undefined = 解除定长回自适应) */
  onResizeHeight(
    id: TodoId,
    height: number | undefined
  ): Promise<Result<TodoCard>>;
  /** 归档:清除本卡全部已完成条目(todo-height-archive,两模式可见) */
  onClearDoneItems(id: TodoId): Promise<Result<TodoCard>>;
};

/**
 * 待办卡(ADR-0006,todo-card):画布上与分组卡并排的清单卡——
 * 标题 + 可勾选条目;完成项划线沉卡底(顺序由 store 维护,组件纯展示)。
 * 门禁:日常态开勾选/取消与添加条目两个洞(ADR-0006 补记);删除/改文本/
 * 改名/卡内拖拽排序/调宽/换色只在白板模式。宽为自由宽(缺省 = CARD_W,
 * schema v10;拖右缘连续调宽、松手 16px 网格吸附);缺省中性配色,
 * 可选卡色底染(todo-card-size-color)。memo:props 未变时跳过重渲染
 * (同 GroupSection)。
 * 条目排序为 HTML5 DnD(自含实现,与收藏的 useCardDnD 分立——
 * 那是跨组移动的深 module,卡内单容器不背它的形状)。
 */
export const TodoSection = memo(function TodoSection({
  todo,
  placement,
  whiteboardMode,
  dragActive,
  resizable,
  resizeMaxW,
  elementRef,
  onRename,
  onDeleteTodo,
  onAddItem,
  onEditItem,
  onToggleItem,
  onRemoveItem,
  onReorderItems,
  onResizeWidth,
  onRecolor,
  onResizeHeight,
  onClearDoneItems,
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

  // 卡头选色(todo-card-size-color):白板模式展开卡内色板行
  const [pickingColor, setPickingColor] = useState(false);

  // ---- 卡右缘调宽(todo-card-size-color 自由宽)+ 卡底缘定长调高
  // (todo-height-archive):两份孪生的 preview/committed 双态 + 回流
  // 哨兵 + 指针/键盘接线收敛进 useAxisResize(todo-review-followups/01),
  // 本组件只供配置。松手 16px 网格吸附;宽上界随画布宽收窄
  // (Whiteboard 供给 resizeMaxW),高不收窄(画布向下无界)。
  const minW = TODO_W_MIN;
  const maxW = Math.max(minW, resizeMaxW ?? minW);
  const minH = TODO_H_MIN;
  const maxH = TODO_H_MAX;

  /** 16px 网格吸附(同画布宽/拖位松手口径;吸附取最近格点合法)。 */
  function snapGrid(v: number): number {
    return Math.round(v / 16) * 16;
  }

  /** 键盘一步:从当前值的上/下一格网格起(store 收口重复钳)。 */
  function stepGrid(current: number, dir: 1 | -1): number {
    return dir > 0
      ? (Math.floor(current / 16) + 1) * 16
      : (Math.ceil(current / 16) - 1) * 16;
  }

  /** 自适应卡的调高基数:实测高(事件时即时量高,读 DOM 同步口径;
   * jsdom/未挂载为 0 → 下界兜底)。 */
  function measuredBaseOf(el: EventTarget | null): number {
    const section = (el as HTMLElement | null)?.closest("section.todo");
    const h = section?.getBoundingClientRect().height ?? 0;
    return Math.max(minH, Math.floor(h));
  }

  const resizeW = useAxisResize<{ atWidth: number | undefined }>({
    axis: "x",
    min: minW,
    max: maxW,
    base: () => todoWidthOf(todo),
    snap: snapGrid,
    step: stepGrid,
    commit: (width) => void onResizeWidth(todo.id, width),
    snapshot: () => ({ atWidth: todo.width }),
    settled: (committedW, pending) =>
      todoWidthOf(todo) === committedW ||
      (pending !== null && todo.width !== pending.atWidth),
    watch: todo,
  });

  const resizeH = useAxisResize<{ atHeight: number | undefined }>({
    axis: "y",
    min: minH,
    max: maxH,
    base: (target) => todo.height ?? measuredBaseOf(target),
    snap: snapGrid,
    step: stepGrid,
    commit: (height) => void onResizeHeight(todo.id, height),
    snapshot: () => ({ atHeight: todo.height }),
    settled: (committedH, pending) =>
      todo.height === committedH ||
      (pending !== null && todo.height !== pending.atHeight),
    watch: todo,
  });

  const undoneCount = todo.items.filter((i) => !i.done).length;
  const hasDone = todo.items.some((i) => i.done);

  const width = resizeW.preview ?? resizeW.committed ?? todoWidthOf(todo);
  // 生效定长高:预览 > 已提交 > 持久;undefined = 自适应(不定位高)
  const fixedH = resizeH.preview ?? resizeH.committed ?? todo.height;

  /** 钉住/解除定长(todo-height-archive):白板模式卡头切换两种高度模式;
   * 钉住 = 以实测高吸附 16px 网格落定长,解除 = undefined 回自适应 */
  const onPinToggleClick = (event: React.MouseEvent) => {
    if (todo.height !== undefined) {
      void onResizeHeight(todo.id, undefined);
      return;
    }
    const pinned = Math.min(
      Math.max(snapGrid(measuredBaseOf(event.currentTarget)), minH),
      maxH
    );
    void onResizeHeight(todo.id, pinned);
  };

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
    ? {
        left: placement.x,
        top: placement.y,
        width,
        ...(fixedH !== undefined ? { height: fixedH } : null),
      }
    : undefined;

  return (
    <section
      className="todo"
      aria-label={todo.title}
      data-drag-active={dragActive ? "true" : undefined}
      data-dragging-item={dragItemId !== null ? "true" : undefined}
      data-resizing={
        resizeW.preview !== null || resizeH.preview !== null
          ? "true"
          : undefined
      }
      data-fixed-height={fixedH !== undefined ? "true" : undefined}
      data-todo-colored={todo.color ? "true" : undefined}
      ref={elementRef}
      style={
        {
          ...(todo.color ? { "--todo-color": todo.color } : null),
          ...canvasStyle,
        } as CSSProperties
      }
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
        {/* 归档(todo-height-archive):两模式可见——勾选消费的自然收尾,
            日常态门禁第三洞(ADR-0006 第三补记);无完成条目时禁用 */}
        <button
          type="button"
          className="icon-button"
          aria-label={`归档待办卡 ${todo.title} 已完成条目`}
          title="归档已完成条目"
          disabled={!hasDone}
          onClick={() => void onClearDoneItems(todo.id)}
        >
          <ArchiveIcon size={14} />
        </button>
        {whiteboardMode && (
          <button
            type="button"
            className="icon-button todo-pin"
            aria-label={
              todo.height !== undefined
                ? `解除待办卡 ${todo.title} 定长,回到自适应`
                : `钉住待办卡 ${todo.title} 高度为定长`
            }
            aria-pressed={todo.height !== undefined}
            title={
              todo.height !== undefined
                ? "解除定长(回自适应)"
                : "钉住高度(定长)"
            }
            onClick={onPinToggleClick}
          >
            {todo.height !== undefined ? (
              <PinOffIcon size={14} />
            ) : (
              <PinIcon size={14} />
            )}
          </button>
        )}
        {whiteboardMode && (
          <button
            type="button"
            className="icon-button"
            aria-label={`调整待办卡 ${todo.title} 颜色`}
            aria-expanded={pickingColor}
            title="调整颜色"
            onClick={() => setPickingColor((v) => !v)}
          >
            <PaletteIcon size={14} />
          </button>
        )}
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
      {/* 选色行(todo-card-size-color):白板模式卡头展开;色板 + 中性复位 */}
      {whiteboardMode && pickingColor && (
        <div className="todo-color-row">
          <ColorSwatches
            name={`todo-color-${todo.id}`}
            value={todo.color ?? ""}
            onChange={(color) => void onRecolor(todo.id, color)}
            label={`待办卡 ${todo.title} 颜色`}
          />
          <button
            type="button"
            className="todo-color-neutral"
            aria-pressed={todo.color === undefined}
            title="回到缺省的中性白卡"
            onClick={() => void onRecolor(todo.id, "")}
          >
            中性
          </button>
        </div>
      )}
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
      {/* 卡尾常驻添加行(ADR-0006 补记,两态同款):回车即加,静默清空;空卡无占位提示,输入框即是 */}
      <input
        className="todo-add"
        type="text"
        placeholder="+ 添加待办…"
        value={addText}
        onChange={(e) => setAddText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submitAdd();
        }}
        aria-label="添加待办"
        autoComplete="off"
      />
      {/* 卡右缘调宽拖柄(todo-card-size-color 自由宽):白板模式且非搜索;
          键盘可达(separator 角色),←/→ 步进一格 16px 网格;
          调宽中回显连续宽 */}
      {resizable && (
        <div
          className="todo-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label={`调整待办卡 ${todo.title} 宽度`}
          aria-valuenow={Math.round(width)}
          aria-valuemin={minW}
          aria-valuemax={maxW}
          aria-valuetext={`${Math.round(width)} px`}
          title="拖动调整宽度"
          tabIndex={0}
          {...resizeW.handleProps}
        >
          {resizeW.preview !== null && (
            <span className="todo-resize-badge" role="status">
              {Math.round(resizeW.preview)} px
            </span>
          )}
        </div>
      )}
      {/* 卡底缘定长调高拖柄(todo-height-archive):门禁同宽柄(白板模式
          且非搜索);键盘 ↑/↓ 步进一格 16px 网格;调高中回显连续高;
          自适应卡读数报「自适应」(valuenow 为下界兜底基数) */}
      {resizable && (
        <div
          className="todo-resize-b"
          role="separator"
          aria-orientation="horizontal"
          aria-label={`调整待办卡 ${todo.title} 高度`}
          aria-valuenow={Math.round(fixedH ?? minH)}
          aria-valuemin={minH}
          aria-valuemax={maxH}
          aria-valuetext={
            fixedH !== undefined ? `${Math.round(fixedH)} px` : "自适应"
          }
          title="拖动调整高度"
          tabIndex={0}
          {...resizeH.handleProps}
        >
          {resizeH.preview !== null && (
            <span className="todo-resize-badge" role="status">
              {Math.round(resizeH.preview)} px
            </span>
          )}
        </div>
      )}
    </section>
  );
});
