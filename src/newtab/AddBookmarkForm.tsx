import { useState } from 'react'
import type { NewBookmarkInput } from '../domain/store'

type AddBookmarkFormProps = {
  onAdd: (input: NewBookmarkInput) => Promise<{ ok: boolean }>
}

/** 手动添加收藏(URL/标题/备注),缺省进收集箱。 */
export function AddBookmarkForm({ onAdd }: AddBookmarkFormProps) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await onAdd({ url, title, note })
    if (result.ok) {
      setUrl('')
      setTitle('')
      setNote('')
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
      <button type="submit">添加收藏</button>
    </form>
  )
}
