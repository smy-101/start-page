import { useEffect, useState } from 'react'
import type { BookmarkState, StorageAdapter } from '../domain/types'
import { createBookmarkStore } from '../domain/store'
import type { BookmarkStore, NewBookmarkInput } from '../domain/store'
import { filterState } from '../domain/search'
import { createChromeStorage } from '../storage/chromeStorage'
import type { NativeBookmarkNode } from '../domain/nativeImport'
import { AddBookmarkForm } from './AddBookmarkForm'
import { BookmarkGroups } from './BookmarkGroups'
import { SearchBox } from './SearchBox'
import { SettingsView } from './SettingsView'
import { searchUrl } from './searchEngine'
import type { EngineId } from './searchEngine'
import { createChromeSettingsStorage, DEFAULT_SETTINGS, loadSettings } from './settings'
import type { SettingsAdapter } from './settings'
import { getNativeBookmarkTree } from './nativeBookmarks'
import { domainErrorText } from './messages'

const chromeStorage = createChromeStorage()
const chromeSettingsStorage = createChromeSettingsStorage()

type AppProps = {
  /** 注入存储适配器;缺省用 chrome.storage.local(测试注入内存适配器) */
  adapter?: StorageAdapter
  /** 设置存储适配器(引擎选择等,与收藏状态分开存储);测试注入内存实现 */
  settingsAdapter?: SettingsAdapter
  /** 原生书签树读取缝隙;测试注入假树 */
  getBookmarkTree?: () => Promise<NativeBookmarkNode[]>
}

export function App({
  adapter = chromeStorage,
  settingsAdapter = chromeSettingsStorage,
  getBookmarkTree = getNativeBookmarkTree,
}: AppProps) {
  const [store, setStore] = useState<BookmarkStore | null>(null)
  const [state, setState] = useState<BookmarkState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 导入会绕过 store 直接写适配器;递增此计数强制重建 store 重读状态
  // (适配器 subscribe 亦会触发;此处与跨上下文同步机制并存,epoch 保底刷新)
  const [storeEpoch, setStoreEpoch] = useState(0)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'start' | 'settings'>('start')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  useEffect(() => {
    let cancelled = false
    // 序号防止乱序:仅最后一次重建生效(自身写入与 service worker 写入都会触发)
    let bootSeq = 0
    async function boot() {
      const current = ++bootSeq
      const created = await createBookmarkStore(adapter)
      if (cancelled || current !== bootSeq) return
      setStore(created)
      setState(created.getState())
    }
    void boot()
    // 跨上下文同步:任何上下文写入状态(含本页自己)→ 重建收藏库重渲染
    const unsubscribe = adapter.subscribe?.(() => {
      void boot()
    })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [adapter, storeEpoch])

  useEffect(() => {
    let cancelled = false
    // 读取失败时保持默认设置:引擎设置不阻塞初始页(存值损坏也由 loadSettings 回退默认)
    loadSettings(settingsAdapter)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [settingsAdapter])

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

  /** 换引擎即存,回车立即生效 */
  async function handleEngineChange(engine: EngineId) {
    setSettings({ engine })
    await settingsAdapter.save({ engine })
  }

  /** 回车:新开标签页按所选引擎搜索输入词;空白不跳转 */
  function handleSearch(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    window.open(searchUrl(trimmed, settings.engine), '_blank', 'noopener')
  }

  // 查询为空时原样返回(完整分组视图);有查询时隐藏无命中的收藏与分组
  const visible = filterState(state, query)

  function bumpStoreEpoch() {
    setStoreEpoch((epoch) => epoch + 1)
  }

  if (view === 'settings') {
    return (
      <SettingsView
        settings={settings}
        onEngineChange={(engine) => void handleEngineChange(engine)}
        onBack={() => setView('start')}
        state={state}
        adapter={adapter}
        onImported={bumpStoreEpoch}
        getBookmarkTree={getBookmarkTree}
      />
    )
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">初始页</h1>
        {/* 工单 08:导入导出迁入设置页,头部只保留齿轮入口 */}
        <button type="button" className="gear-button" aria-label="设置" onClick={() => setView('settings')}>
          ⚙ 设置
        </button>
      </header>
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
