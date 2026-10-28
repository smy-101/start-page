import { useEffect, useState } from 'react'
import type { BookmarkId, BookmarkState, GroupId, Result, StorageAdapter } from '../domain/types'
import { createBookmarkStore } from '../domain/store'
import type { BookmarkStore, NewBookmarkInput, NewGroupInput } from '../domain/store'
import { filterState } from '../domain/search'
import { createChromeStorage } from '../storage/chromeStorage'
import type { NativeBookmarkNode } from '../domain/nativeImport'
import { AddBookmarkForm } from './AddBookmarkForm'
import { BookmarkGroups } from './BookmarkGroups'
import { NewGroupForm } from './NewGroupForm'
import { SearchBox } from './SearchBox'
import { SettingsView } from './SettingsView'
import { searchUrl } from './searchEngine'
import type { EngineId } from './searchEngine'
import { createChromeSettingsStorage, DEFAULT_SETTINGS, loadSettings } from './settings'
import type { SettingsAdapter } from './settings'
import { getNativeBookmarkTree } from './nativeBookmarks'
import { loadCollapsedGroups, saveCollapsedGroups } from './collapsedGroups'
import { domainErrorText } from './messages'

const chromeStorage = createChromeStorage()
const chromeSettingsStorage = createChromeSettingsStorage()

/** 拖拽中对象:整个分组(组间排序)或收藏卡片(组内排序/跨组移动)。 */
type Drag =
  | { kind: 'group'; id: GroupId }
  | { kind: 'bookmark'; id: BookmarkId; groupId: GroupId }
  | null

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
  const [notice, setNotice] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'start' | 'settings'>('start')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  // 折叠是 UI 状态:localStorage 侧通道持久化,刷新后保持
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadCollapsedGroups())
  const [drag, setDrag] = useState<Drag>(null)

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

  /** 领域操作的统一包装:成功刷新视图,失败给出中文提示。 */
  async function run<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
    const result = await action()
    if (result.ok) {
      setError(null)
      refresh()
    } else {
      setError(domainErrorText[result.error])
    }
    return result
  }

  async function handleAdd(input: NewBookmarkInput) {
    setNotice(null)
    return run(() => active.addBookmark(input))
  }

  /** 表单类操作:成功即刷新,错误由表单就地展示(而非页面顶部)。 */
  async function refreshOnOk<T>(action: () => Promise<Result<T>>): Promise<Result<T>> {
    const result = await action()
    if (result.ok) refresh()
    return result
  }

  function handleCreateGroup(input: NewGroupInput) {
    return refreshOnOk(() => active.createGroup(input))
  }

  function handleRenameGroup(id: GroupId, name: string) {
    return refreshOnOk(() => active.renameGroup(id, name))
  }

  function handleRecolorGroup(id: GroupId, color: string) {
    return refreshOnOk(() => active.recolorGroup(id, color))
  }

  const handleDeleteGroup = async (id: GroupId) => {
    const group = state.groups.find((g) => g.id === id)
    const result = await refreshOnOk(() => active.deleteGroup(id))
    if (result.ok) {
      const count = result.value.recycledIds.length
      setNotice(
        count > 0
          ? `已删除分组「${group?.name ?? ''}」,${count} 条收藏已移入收集箱`
          : `已删除分组「${group?.name ?? ''}」`,
      )
    }
    return result
  }

  function handleToggleCollapse(groupId: string) {
    const next = new Set(collapsed)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    saveCollapsedGroups(next)
    setCollapsed(next)
  }
  /** 放置前置条件:dragover 阻止默认行为,浏览器才允许 drop。 */
  const allowDrop = (event: React.DragEvent) => {
    event.preventDefault()
  }

  /** 分区放置:拖组→与目标组换位;拖收藏→追加到目标组末尾。 */
  const handleSectionDrop = (_event: React.DragEvent, targetGroupId: GroupId) => {
    const current = drag
    setDrag(null)
    if (!current) return
    if (current.kind === 'group') {
      if (current.id === targetGroupId) return
      const without = [...state.groups]
        .sort((a, b) => a.order - b.order)
        .map((g) => g.id)
        .filter((id) => id !== current.id)
      without.splice(without.indexOf(targetGroupId), 0, current.id)
      void run(() => active.reorderGroups(without))
    } else {
      // 下标按完整状态计算,搜索过滤视图下拖拽同样落到真实末尾
      const index = state.bookmarks.filter(
        (b) => b.groupId === targetGroupId && b.id !== current.id,
      ).length
      void run(() => active.moveBookmark(current.id, targetGroupId, index))
    }
  }

  /** 卡片放置:移到目标卡片之前(组内排序与跨组移动共用);拖组则冒泡给分区。 */
  const handleCardDrop = (event: React.DragEvent, targetBookmarkId: BookmarkId) => {
    const current = drag
    if (!current || current.kind === 'group') return
    // 收藏拖放由卡片就地处理,不再冒泡给分区(避免二次追加)
    event.stopPropagation()
    setDrag(null)
    if (current.id === targetBookmarkId) return
    const target = state.bookmarks.find((b) => b.id === targetBookmarkId)
    if (!target) return
    const index = state.bookmarks
      .filter((b) => b.groupId === target.groupId && b.id !== current.id)
      .sort((a, b) => a.order - b.order)
      .findIndex((b) => b.id === targetBookmarkId)
    void run(() => active.moveBookmark(current.id, target.groupId, index))
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
  // 选分组候选用全量分组(搜索过滤视图下也不缩水),按 order 排序、含收集箱
  const groupsInOrder = [...state.groups].sort((a, b) => a.order - b.order)

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
      <AddBookmarkForm groups={groupsInOrder} onAdd={handleAdd} />
      <NewGroupForm onCreate={handleCreateGroup} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <BookmarkGroups
        state={visible}
        groups={groupsInOrder}
        searching={query.trim() !== ''}
        collapsedGroups={collapsed}
        onToggleCollapse={handleToggleCollapse}
        onRenameGroup={handleRenameGroup}
        onRecolorGroup={handleRecolorGroup}
        onDeleteGroup={handleDeleteGroup}
        onGroupDragStart={(groupId) => setDrag({ kind: 'group', id: groupId })}
        onCardDragStart={(bookmarkId, groupId) => setDrag({ kind: 'bookmark', id: bookmarkId, groupId })}
        onDragEnd={() => setDrag(null)}
        onSectionDragOver={allowDrop}
        onSectionDrop={handleSectionDrop}
        onCardDragOver={allowDrop}
        onCardDrop={handleCardDrop}
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
