import { useState } from 'react'
import type { BookmarkState, StorageAdapter } from '../domain/types'
import type { NativeBookmarkNode } from '../domain/nativeImport'
import { importNativeBookmarks } from '../domain/nativeImport'
import type { EngineId } from './searchEngine'
import { ENGINES, ENGINE_IDS } from './searchEngine'
import type { Settings } from './settings'
import { getNativeBookmarkTree } from './nativeBookmarks'
import { ImportExport } from './ImportExport'

type SettingsViewProps = {
  settings: Settings
  onEngineChange: (engine: EngineId) => void
  onBack: () => void
  /** 导入导出与原生书签导入共用收藏状态与存储适配器 */
  state: BookmarkState
  adapter: StorageAdapter
  /** 导入成功后回调(父层重载状态) */
  onImported: () => void
  /** chrome.bookmarks 树读取缝隙(测试注入假树) */
  getBookmarkTree?: () => Promise<NativeBookmarkNode[]>
}

/** 原生书签导入按钮的状态提示。 */
function reportText(added: number, skipped: number): string {
  return `新增 ${added} 条、跳过 ${skipped} 条`
}

/**
 * 设置页(工单 08):搜索引擎选择、从浏览器书签导入、导入导出入口(自初始页头部迁入)。
 * 深浅色跟随系统(全局 CSS 变量),全中文。
 */
export function SettingsView({
  settings,
  onEngineChange,
  onBack,
  state,
  adapter,
  onImported,
  getBookmarkTree = getNativeBookmarkTree,
}: SettingsViewProps) {
  const [nativeReport, setNativeReport] = useState<string | null>(null)
  const [nativeError, setNativeError] = useState<string | null>(null)

  async function handleImportNative() {
    let result
    try {
      result = await importNativeBookmarks(adapter, await getBookmarkTree())
    } catch {
      result = null
    }
    if (result && result.ok) {
      setNativeError(null)
      setNativeReport(reportText(result.value.added, result.value.skipped))
      onImported()
    } else if (result) {
      // 解析层唯一失败模式:树中无任何可导入书签
      setNativeReport(null)
      setNativeError('浏览器书签为空,没有可导入的书签')
    } else {
      setNativeReport(null)
      setNativeError('读取浏览器书签失败,请稍后重试')
    }
  }

  return (
    <main className="page settings">
      <header className="settings-header">
        <h1 className="page-title">设置</h1>
        <button type="button" onClick={onBack}>
          返回初始页
        </button>
      </header>

      <section className="settings-section" aria-label="搜索引擎">
        <h2>搜索引擎</h2>
        <p className="settings-hint">搜索框回车将使用所选引擎搜索</p>
        <div className="settings-engine-options" role="radiogroup" aria-label="默认搜索引擎">
          {ENGINE_IDS.map((id) => (
            <label key={id}>
              <input
                type="radio"
                name="search-engine"
                checked={settings.engine === id}
                onChange={() => onEngineChange(id)}
              />
              {ENGINES[id].name}
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-label="原生书签导入">
        <h2>原生书签</h2>
        <p className="settings-hint">
          从浏览器书签一次性导入:顶层文件夹转为分组、散项进收集箱,重复网址自动跳过
        </p>
        <button type="button" onClick={() => void handleImportNative()}>
          从浏览器书签导入
        </button>
        {nativeReport && (
          <p className="import-report" role="status">
            {nativeReport}
          </p>
        )}
        {nativeError && (
          <p className="form-error" role="alert">
            {nativeError}
          </p>
        )}
      </section>

      <h2 className="settings-subheading">导入导出</h2>
      <ImportExport state={state} adapter={adapter} onImported={onImported} />
    </main>
  )
}
