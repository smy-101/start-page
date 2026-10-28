import { useEffect, useState } from 'react'
import type { BookmarkState, StorageAdapter } from '../domain/types'
import { createBookmarkStore } from '../domain/store'
import type { BookmarkStore, NewBookmarkInput } from '../domain/store'
import { filterState } from '../domain/search'
import { createChromeStorage } from '../storage/chromeStorage'
import { AddBookmarkForm } from './AddBookmarkForm'
import { BookmarkGroups } from './BookmarkGroups'
import { SearchBox } from './SearchBox'
import { searchUrl } from './searchEngine'
import { domainErrorText } from './messages'

const chromeStorage = createChromeStorage()

type AppProps = {
  /** 注入存储适配器;缺省用 chrome.storage.local(测试注入内存适配器) */
  adapter?: StorageAdapter
}

export function App({ adapter = chromeStorage }: AppProps) {
  const [store, setStore] = useState<BookmarkStore | null>(null)
  const [state, setState] = useState<BookmarkState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    void createBookmarkStore(adapter).then((created) => {
      if (cancelled) return
      setStore(created)
      setState(created.getState())
    })
    return () => {
      cancelled = true
    }
  }, [adapter])

  if (!store || !state) {
    return (
      <main className="page">
        <p className="loading">加载中…</p>
      </main>
    )
  }
  const active = store

  function refresh() {
    setState(active.getState())
  }

  async function handleAdd(input: NewBookmarkInput) {
    const result = await active.addBookmark(input)
    if (result.ok) {
      setError(null)
      refresh()
    } else {
      setError(domainErrorText[result.error])
    }
    return result
  }

  /** 回车:新开标签页跳默认引擎(当前必应)搜索输入词;空白不跳转 */
  function handleSearch(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    window.open(searchUrl(trimmed), '_blank', 'noopener')
  }

  // 查询为空时原样返回(完整分组视图);有查询时隐藏无命中的收藏与分组
  const visible = filterState(state, query)

  return (
    <main className="page">
      <h1 className="page-title">初始页</h1>
      <SearchBox query={query} onChange={setQuery} onSearch={handleSearch} />
      <AddBookmarkForm onAdd={handleAdd} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <BookmarkGroups
        state={visible}
        searching={query.trim() !== ''}
        onEdit={async (id, patch) => {
          const result = await active.updateBookmark(id, patch)
          if (result.ok) refresh()
          return result
        }}
        onDelete={async (id) => {
          const result = await active.removeBookmark(id)
          if (result.ok) refresh()
          return result
        }}
      />
    </main>
  )
}
