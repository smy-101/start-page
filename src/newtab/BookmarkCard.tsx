import { useState } from 'react'
import type { Bookmark, Group, Result } from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import { Favicon } from './Favicon'
import { domainErrorText } from './messages'

type BookmarkCardProps = {
  bookmark: Bookmark
  group: Group
  onEdit: (id: string, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: string) => Promise<Result<string>>
}

/** 收藏卡片:点击主体区域在新标签页打开网页;支持编辑(标题/URL/备注)与删除。 */
export function BookmarkCard({ bookmark, group, onEdit, onDelete }: BookmarkCardProps) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(bookmark.url)
  const [title, setTitle] = useState(bookmark.title)
  const [note, setNote] = useState(bookmark.note)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setUrl(bookmark.url)
    setTitle(bookmark.title)
    setNote(bookmark.note)
    setError(null)
    setEditing(true)
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const result = await onEdit(bookmark.id, { url, title, note })
    if (result.ok) {
      setEditing(false)
    } else {
      setError(domainErrorText[result.error])
    }
  }

  async function handleDelete() {
    const result = await onDelete(bookmark.id)
    if (!result.ok) setError(domainErrorText[result.error])
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
    )
  }

  return (
    <li className="card">
      <a className="card-link" href={bookmark.url} target="_blank" rel="noreferrer">
        <Favicon pageUrl={bookmark.url} title={bookmark.title} fallbackColor={group.color} />
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
  )
}
