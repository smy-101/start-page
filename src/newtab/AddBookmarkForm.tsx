import { useState } from 'react'
import type { NewBookmarkInput } from '../domain/store'
import { INBOX_GROUP_ID } from '../domain/store'
import type { Group } from '../domain/types'

type AddBookmarkFormProps = {
  /** 分组候选(按 order 排序,含收集箱):spec 故事 17 手动添加需可选分组 */
  groups: Group[]
  onAdd: (input: NewBookmarkInput) => Promise<{ ok: boolean }>
}

/** 手动添加收藏(URL/标题/备注/所属分组),缺省进收集箱。 */
export function AddBookmarkForm({ groups, onAdd }: AddBookmarkFormProps) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [groupId, setGroupId] = useState(INBOX_GROUP_ID)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await onAdd({ url, title, note, groupId })
    if (result.ok) {
      setUrl('')
      setTitle('')
      setNote('')
      setGroupId(INBOX_GROUP_ID)
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <label htmlFor="add-url">网址</label>
      <input
        id="add-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="example.com"
        autoComplete="off"
        required
      />
      <label htmlFor="add-title">标题</label>
      <input
        id="add-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="留空自动取网站地址"
        autoComplete="off"
      />
      <label htmlFor="add-note">备注</label>
      <input
        id="add-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="可选"
        autoComplete="off"
      />
      <label htmlFor="add-group">所属分组</label>
      <select id="add-group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <button type="submit">添加收藏</button>
    </form>
  )
}
