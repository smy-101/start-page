import { Fragment, memo, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  RefCallback,
} from "react";
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

  // ---- 卡右缘调宽(todo-card-size-color 自由宽):镜像分组的 preview/
  // committed 双状态 + 回流哨兵(松手 16px 网格吸附,已提交宽留到持久
  // 回流再清,免闪回)。delta 制(起点宽 + 指针位移),不依赖 rect——
  // jsdom 里几何全 0 亦可测。
  const [previewW, setPreviewW] = useState<number | null>(null);
  const [committedW, setCommittedW] = useState<number | null>(null);
  const sessionRef = useRef<{ startX: number; startW: number } | null>(null);
  // 提交时的持久宽快照:store 钳回不同值(窄画布收窄)时持久值偏离快照,
  // 同样解除本地宽(两幂数据均应清)
  const pendingRef = useRef<{ atWidth: number | undefined } | null>(null);
  // 卡头选色(todo-card-size-color):白板模式展开卡内色板行
  const [pickingColor, setPickingColor] = useState(false);

  // ---- 卡底缘定长调高(todo-height-archive):镜像调宽的 preview/
  // committed 双状态 + 回流哨兵(松手 16px 网格吸附,已提交高留到持久
  // 回流再清)。高不随画布宽收窄(画布向下无界,无 resizeMaxH 之需)。
  const [previewH, setPreviewH] = useState<number | null>(null);
  const [committedH, setCommittedH] = useState<number | null>(null);
  const sessionHRef = useRef<{ startY: number; startH: number } | null>(null);
  // 提交时的持久高快照:store 写回或高被外部改动时解除本地高
  const pendingHRef = useRef<{ atHeight: number | undefined } | null>(null);

  const undoneCount = todo.items.filter((i) => !i.done).length;
  const hasDone = todo.items.some((i) => i.done);

  const width = previewW ?? committedW ?? todoWidthOf(todo);
  const minW = TODO_W_MIN;
  const maxW = Math.max(minW, resizeMaxW ?? minW);

  const minH = TODO_H_MIN;
  const maxH = TODO_H_MAX;
  // 生效定长高:预览 > 已提交 > 持久;undefined = 自适应(不定位高)
  const fixedH = previewH ?? committedH ?? todo.height;

  // 回流哨兵:持久宽追上已提交宽即清;store 钳回不同值(窄画布收窄)
  // 或宽被外部改动(缩画布)时持久值偏离提交时快照,同样解除本地宽
  useEffect(() => {
    if (committedW === null) {
      pendingRef.current = null;
      return;
    }
    const pending = pendingRef.current;
    const settled =
      todoWidthOf(todo) === committedW ||
      (pending !== null && todo.width !== pending.atWidth);
    if (settled) {
      setCommittedW(null);
      pendingRef.current = null;
    }
  }, [committedW, todo]);

  // 调高回流哨兵:镜像调宽——持久高追上已提交高即清;高被外部改动
  // (理论上仅手改 JSON)时持久值偏离提交快照,同样解除本地高
  useEffect(() => {
    if (committedH === null) {
      pendingHRef.current = null;
      return;
    }
    const pending = pendingHRef.current;
    const settled =
      todo.height === committedH ||
      (pending !== null && todo.height !== pending.atHeight);
    if (settled) {
      setCommittedH(null);
      pendingHRef.current = null;
    }
  }, [committedH, todo]);

  /** 调宽一步:连续预览宽,钳 [minW, maxW](网格吸附留到松手)。 */
  function applyResize(clientX: number): void {
    const session = sessionRef.current;
    if (!session) return;
    const next = session.startW + (clientX - session.startX);
    setPreviewW(Math.min(Math.max(next, minW), maxW));
  }

  /** 宽度吸附 16px 网格(同画布宽/拖位松手口径;CODING_STANDARDS:吸附
   * 取最近格点合法)。 */
  function snapGrid(w: number): number {
    return Math.round(w / 16) * 16;
  }

  function finishResize(): void {
    const session = sessionRef.current;
    const preview = previewW;
    sessionRef.current = null;
    setPreviewW(null);
    if (!session || preview === null) return;
    // 松手吸附 16px 网格后再钳界限;已提交宽留到持久回流再清
    const next = Math.min(Math.max(snapGrid(preview), minW), maxW);
    pendingRef.current = { atWidth: todo.width };
    setCommittedW(next);
    void onResizeWidth(todo.id, next);
  }

  function cancelResize(): void {
    sessionRef.current = null;
    setPreviewW(null);
  }

  useEffect(() => {
    if (sessionRef.current === null && previewW === null) return;
    const move = (event: PointerEvent) => {
      if (sessionRef.current) applyResize(event.clientX);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
    // 会话回调读的是渲染期最新闭包;挂仅发生在会话期间
  });

  const onHandlePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // 不劫持卡移动会话(画布级 pointerdown 委托)
    event.stopPropagation();
    sessionRef.current = { startX: event.clientX, startW: width };
    setPreviewW(width);
  };

  // 键盘:←/→ 步进一格 16px 网格(从当前宽的上/下一格起,钳界限;
  // store 收口重复钳)。当前值吃本地已提交宽(回流前连按可累计)
  const onHandleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const base = committedW ?? width;
    const nextGrid =
      step > 0
        ? (Math.floor(base / 16) + 1) * 16
        : (Math.ceil(base / 16) - 1) * 16;
    const next = Math.min(Math.max(nextGrid, minW), maxW);
    if (Math.abs(next - base) < 0.5) return;
    pendingRef.current = { atWidth: todo.width };
    setCommittedW(next);
    void onResizeWidth(todo.id, next);
  };

  /** 自适应卡的调高基数:实测高(事件时即时量高,读 DOM 同步口径;
   * jsdom/未挂载为 0 → 下界兜底)。 */
  function measuredBaseOf(el: EventTarget | null): number {
    const section = (el as HTMLElement | null)?.closest("section.todo");
    const h = section?.getBoundingClientRect().height ?? 0;
    return Math.max(minH, Math.floor(h));
  }

  /** 调高一步:连续预览高,钳 [minH, maxH](网格吸附留到松手)。 */
  function applyResizeH(clientY: number): void {
    const session = sessionHRef.current;
    if (!session) return;
    const next = session.startH + (clientY - session.startY);
    setPreviewH(Math.min(Math.max(next, minH), maxH));
  }

  function finishResizeH(): void {
    const session = sessionHRef.current;
    const preview = previewH;
    sessionHRef.current = null;
    setPreviewH(null);
    if (!session || preview === null) return;
    const next = Math.min(Math.max(snapGrid(preview), minH), maxH);
    pendingHRef.current = { atHeight: todo.height };
    setCommittedH(next);
    void onResizeHeight(todo.id, next);
  }

  function cancelResizeH(): void {
    sessionHRef.current = null;
    setPreviewH(null);
  }

  useEffect(() => {
    if (sessionHRef.current === null && previewH === null) return;
    const move = (event: PointerEvent) => {
      if (sessionHRef.current) applyResizeH(event.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finishResizeH);
    window.addEventListener("pointercancel", cancelResizeH);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finishResizeH);
      window.removeEventListener("pointercancel", cancelResizeH);
    };
  });

  const onHHandlePointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // 不劫持卡移动会话(画布级 pointerdown 委托)
    event.stopPropagation();
    const base = todo.height ?? measuredBaseOf(event.currentTarget);
    sessionHRef.current = { startY: event.clientY, startH: base };
    setPreviewH(base);
  };

  // 键盘:↓/↑ 步进一格 16px 网格(从当前高的下/上一格起,钳界限);
  // 自适应卡基数取实测高(↓ 首步从实测高长起,不从下界跳变)
  const onHHandleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    const base =
      committedH ?? todo.height ?? measuredBaseOf(event.currentTarget);
    const nextGrid =
      step > 0
        ? (Math.floor(base / 16) + 1) * 16
        : (Math.ceil(base / 16) - 1) * 16;
    const next = Math.min(Math.max(nextGrid, minH), maxH);
    if (Math.abs(next - base) < 0.5) return;
    pendingHRef.current = { atHeight: todo.height };
    setCommittedH(next);
    void onResizeHeight(todo.id, next);
  };

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
        previewW !== null || previewH !== null ? "true" : undefined
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
          onPointerDown={onHandlePointerDown}
          onKeyDown={onHandleKeyDown}
        >
          {previewW !== null && (
            <span className="todo-resize-badge" role="status">
              {Math.round(previewW)} px
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
          onPointerDown={onHHandlePointerDown}
          onKeyDown={onHHandleKeyDown}
        >
          {previewH !== null && (
            <span className="todo-resize-badge" role="status">
              {Math.round(previewH)} px
            </span>
          )}
        </div>
      )}
    </section>
  );
});
