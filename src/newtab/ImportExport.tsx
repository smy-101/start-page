import { useRef, useState } from 'react'
import type { BookmarkState, StorageAdapter } from '../domain/types'
import type { ImportMode } from '../domain/importExport'
import {
  exportStateAsHtml,
  exportStateAsJson,
  importBookmarksFromHtml,
  importStateFromJson,
} from '../domain/importExport'
import { domainErrorText } from './messages'

type ImportExportProps = {
  /** 当前状态快照(导出用;导入后由 onImported 促使父层重建) */
  state: BookmarkState
  /** 存储适配器:导入写入走同一持久化缝隙 */
  adapter: StorageAdapter
  /** 导入成功后回调(父层据此重载状态) */
  onImported: () => void
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * 导入导出入口(初始页设置区,工单 08 收纳进设置页;保持轻量便于迁移)。
 * 文件读取在 UI 层,导入逻辑在领域层纯函数。
 */
export function ImportExport({ state, adapter, onImported }: ImportExportProps) {
  const [mode, setMode] = useState<ImportMode>('merge')
  const [report, setReport] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await readFileText(file)
    const isJson = file.name.toLowerCase().endsWith('.json')
    const result = isJson
      ? await importStateFromJson(adapter, text, mode)
      : await importBookmarksFromHtml(adapter, text)
    if (result.ok) {
      setError(null)
      setReport(`新增 ${result.value.added} 条、跳过 ${result.value.skipped} 条`)
      onImported()
    } else {
      setReport(null)
      setError(domainErrorText[result.error])
    }
    // 复位以允许再次选择同一文件
    if (fileInput.current) fileInput.current.value = ''
  }

  return (
    <section className="import-export" aria-label="导入导出">
      <button type="button" onClick={() => downloadText('start-page-backup.json', exportStateAsJson(state), 'application/json')}>
        导出 JSON
      </button>
      <button type="button" onClick={() => downloadText('start-page-bookmarks.html', exportStateAsHtml(state), 'text/html')}>
        导出 HTML
      </button>
      <span className="import-mode">
        <span className="import-mode-label">导入模式</span>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'merge'}
            onChange={() => setMode('merge')}
          />
          合并(跳过重复)
        </label>
        <label>
          <input
            type="radio"
            name="import-mode"
            checked={mode === 'replace'}
            onChange={() => setMode('replace')}
          />
          替换全部
        </label>
        <small>HTML 书签文件始终按合并导入</small>
      </span>
      <label className="import-file">
        导入文件
        <input
          ref={fileInput}
          type="file"
          accept=".json,.html,.htm"
          onChange={handleFile}
        />
      </label>
      {report && (
        <p className="import-report" role="status">
          {report}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
