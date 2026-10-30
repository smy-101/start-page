import { memo, useState } from "react";
import type { Bookmark, BookmarkId, Group, Result } from "../domain/types";
import type { BookmarkPatch } from "../domain/store";
import { Favicon } from "./Favicon";
import { domainErrorText } from "./messages";
import { PencilIcon, TrashIcon } from "./Icon";
import type { DragHandlers } from "./useCardDnD";

type BookmarkCardProps = {
  bookmark: Bookmark;
  group: Group;
  /** 分组候选(按 order 排序,含收集箱):spec 故事 24 编辑需可换组 */
  groups: Group[];
  /** 白板模式(board-whiteboard/03):行尾出编辑/删除、行可拖拽;日常态纯浏览行 */
  whiteboardMode: boolean;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
  /** 拖拽回调束(useCardDnD 出口整束直入;卡片以自身 bookmark 数据供给 id 与
   * 所属组,事件对象透传给 hook(effectAllowed / 指针坐标);memo 比较
   * 4 函数引用 → 1 对象引用) */
  handlers: DragHandlers;
};

/**
 * 收藏行(ui-refresh/04):favicon + 标题的长条行,点击新标签页打开;
 * 网址与备注进 title 提示不占行宽;编辑/删除与拖拽仅在白板模式。
 * memo:行数据与回调未变时跳过重渲染(工单 10a)。
 */
export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  group,
  groups,
  whiteboardMode,
  onEdit,
  onDelete,
  handlers,
}: BookmarkCardProps) {
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [url, setUrl] = useState(bookmark.url);
  const [title, setTitle] = useState(bookmark.title);
  const [note, setNote] = useState(bookmark.note);
  const [groupId, setGroupId] = useState(bookmark.groupId);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setUrl(bookmark.url);
    setTitle(bookmark.title);
    setNote(bookmark.note);
    setGroupId(bookmark.groupId);
    setError(null);
    setEditing(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const result = await onEdit(bookmark.id, { url, title, note, groupId });
    if (result.ok) {
      setEditing(false);
    } else {
      setError(domainErrorText[result.error]);
    }
  }

  async function handleDelete() {
    const result = await onDelete(bookmark.id);
    if (!result.ok) setError(domainErrorText[result.error]);
  }

  if (editing) {
    return (
      <li className="card card-editing">
        <form className="edit-form" onSubmit={handleSave}>
          <label htmlFor={`edit-url-${bookmark.id}`}>网址</label>
          <input
            id={`edit-url-${bookmark.id}`}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            required
          />
          <label htmlFor={`edit-title-${bookmark.id}`}>标题</label>
          <input
            id={`edit-title-${bookmark.id}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoComplete="off"
          />
          <label htmlFor={`edit-note-${bookmark.id}`}>备注</label>
          <input
            id={`edit-note-${bookmark.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoComplete="off"
          />
          <label htmlFor={`edit-group-${bookmark.id}`}>所属分组</label>
          <select
            id={`edit-group-${bookmark.id}`}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            {groups.map((groupOption) => (
              <option key={groupOption.id} value={groupOption.id}>
                {groupOption.name}
              </option>
            ))}
          </select>
          <div className="card-actions">
            <button type="submit">保存</button>
            <button type="button" onClick={() => setEditing(false)}>
              取消
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </li>
    );
  }

  // 行提示:网址 + 备注(不占行宽,悬停可见)
  const tooltip = bookmark.note
    ? `${bookmark.url}\n${bookmark.note}`
    : bookmark.url;

  return (
    <li
      className="card"
      draggable={whiteboardMode}
      data-dragging={dragging ? "true" : undefined}
      onDragStart={(event) => {
        setDragging(true);
        handlers.onCardDragStart(event, bookmark.id, bookmark.groupId);
      }}
      onDragEnd={() => {
        setDragging(false);
        handlers.onDragEnd();
      }}
      onDragOver={(event) => handlers.onCardDragOver(event, bookmark.id)}
      onDrop={(event) => handlers.onCardDrop(event, bookmark.id)}
    >
      <a
        className="card-link"
        href={bookmark.url}
        target="_blank"
        rel="noreferrer"
        title={tooltip}
        // 白板模式下关闭链接原生拖拽(否则拖的是 URL 而非卡片),浏览态保留原生行为
        draggable={whiteboardMode ? false : undefined}
      >
        <Favicon
          pageUrl={bookmark.url}
          title={bookmark.title}
          fallbackColor={group.color}
          iconDataUrl={bookmark.icon}
        />
        <span className="card-title">{bookmark.title}</span>
      </a>
      {whiteboardMode && (
        <div className="card-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="编辑"
            title="编辑"
            onClick={startEdit}
          >
            <PencilIcon size={14} />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label="删除"
            title="删除"
            onClick={handleDelete}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
});
