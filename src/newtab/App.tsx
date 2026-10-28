import { useEffect, useState } from 'react'
import type { BookmarkState, StorageAdapter } from '../domain/types'
import { createBookmarkStore } from '../domain/store'
import type { BookmarkStore, NewBookmarkInput } from '../domain/store'
import { createChromeStorage } from '../storage/chromeStorage'
import { AddBookmarkForm } from './AddBookmarkForm'
import { GroupSection } from './GroupSection'
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

  const groupsByOrder = [...state.groups].sort((a, b) => a.order - b.order)

  return (
    <main className="page">
      <h1 className="page-title">初始页</h1>
      <AddBookmarkForm onAdd={handleAdd} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {groupsByOrder.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          bookmarks={state.bookmarks
            .filter((bookmark) => bookmark.groupId === group.id)
            .sort((a, b) => a.order - b.order)}
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
      ))}
    </main>
  )
}
