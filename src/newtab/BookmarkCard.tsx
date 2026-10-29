import { memo, useState } from "react";
import type {
  Bookmark,
  BookmarkId,
  Group,
  GroupId,
  Result,
} from "../domain/types";
import type { BookmarkPatch } from "../domain/store";
import { Favicon } from "./Favicon";
import { domainErrorText } from "./messages";

type BookmarkCardProps = {
  bookmark: Bookmark;
  group: Group;
  /** 分组候选(按 order 排序,含收集箱):spec 故事 24 编辑需可换组 */
  groups: Group[];
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
  /** 拖拽:卡片既可拖(组内排序/跨组移动)也可作为放置目标(拖到某卡片之前)。
   * 共享回调(稳定身份):卡片以自身 bookmark 数据供给 id 与所属组。 */
  onDragStart(bookmarkId: BookmarkId, groupId: GroupId): void;
  onDragEnd(): void;
  onDragOver(event: React.DragEvent): void;
  onDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
};

/**
 * 收藏卡片:点击主体区域在新标签页打开网页;支持编辑(标题/URL/备注/所属分组)与删除、拖拽移动。
 * memo:卡片数据与回调未变时跳过重渲染(工单 10a)。
 */
export const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  group,
  groups,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: BookmarkCardProps) {
  const [editing, setEditing] = useState(false);
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

  return (
    <li
      className="card"
      draggable={!editing}
      onDragStart={() => onDragStart(bookmark.id, bookmark.groupId)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver(event)}
      onDrop={(event) => onDrop(event, bookmark.id)}
    >
      <a
        className="card-link"
        href={bookmark.url}
        target="_blank"
        rel="noreferrer"
      >
        <Favicon
          pageUrl={bookmark.url}
          title={bookmark.title}
          fallbackColor={group.color}
        />
        <span className="card-title">{bookmark.title}</span>
        <span className="card-url">{bookmark.url}</span>
        {bookmark.note && <span className="card-note">{bookmark.note}</span>}
      </a>
      <div className="card-actions">
        <button type="button" onClick={startEdit}>
          编辑
        </button>
        <button type="button" onClick={handleDelete}>
          删除
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
});
