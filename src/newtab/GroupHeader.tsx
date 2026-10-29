import { useState } from 'react'
import { INBOX_GROUP_ID } from '../domain/store'
import type { DeleteGroupResult, Group, Result } from '../domain/types'
import { ColorSwatches } from './ColorSwatches'
import { domainErrorText } from './messages'

type GroupHeaderProps = {
  group: Group
  bookmarkCount: number
  collapsed: boolean
  onToggleCollapse(): void
  onRename(name: string): Promise<Result<Group>>
  onRecolor(color: string): Promise<Result<Group>>
  onDeleteGroup(): Promise<DeleteGroupResult>
  /** 组间拖拽排序:表头作为拖拽源(放置目标由所在分区承担)。 */
  onDragStart(): void
  onDragEnd(): void
}

/** 分组表头:名字/颜色/计数、折叠开关、内联改名换色、删除(带回收警告)。收集箱只读。 */
export function GroupHeader({
  group,
  bookmarkCount,
  collapsed,
  onToggleCollapse,
  onRename,
  onRecolor,
  onDeleteGroup,
  onDragStart,
  onDragEnd,
}: GroupHeaderProps) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view')
  const [name, setName] = useState(group.name)
  const [color, setColor] = useState(group.color)
  const [error, setError] = useState<string | null>(null)
  const isInbox = group.id === INBOX_GROUP_ID

  function startEdit() {
    setName(group.name)
    setColor(group.color)
    setError(null)
    setMode('edit')
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    // 只提交有变化的字段
    const renamed = name.trim() !== group.name ? await onRename(name) : { ok: true as const, value: group }
    if (!renamed.ok) {
      setError(domainErrorText[renamed.error])
      return
    }
    if (color !== group.color) {
      const recolored = await onRecolor(color)
      if (!recolored.ok) {
        setError(domainErrorText[recolored.error])
        return
      }
    }
    setError(null)
    setMode('view')
  }

  async function handleDelete() {
    const result = await onDeleteGroup()
    if (!result.ok) setError(domainErrorText[result.error])
  }

  return (
    <div
      className="group-header"
      draggable={mode === 'view'}
      onDragStart={() => onDragStart()}
      onDragEnd={onDragEnd}
    >
      {mode === 'edit' && !isInbox ? (
        <form className="group-edit-form" onSubmit={handleSave}>
          <label htmlFor={`group-name-${group.id}`}>分组名</label>
          <input
            id={`group-name-${group.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <ColorSwatches name={`group-color-${group.id}`} value={color} onChange={setColor} />
          <div className="card-actions">
            <button type="submit">保存</button>
            <button type="button" onClick={() => setMode('view')}>
              取消
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : mode === 'delete' && !isInbox ? (
        <div className="group-delete-confirm">
          <p className="group-delete-warning">
            {bookmarkCount > 0
              ? `删除分组「${group.name}」?组内 ${bookmarkCount} 条收藏将全部移入收集箱,不会被删除。`
              : `删除分组「${group.name}」?该分组将被删除。`}
          </p>
          <div className="card-actions">
            <button type="button" onClick={handleDelete}>
              确认删除
            </button>
            <button type="button" onClick={() => setMode('view')}>
              取消
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `展开分组 ${group.name}` : `折叠分组 ${group.name}`}
            onClick={onToggleCollapse}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <span className="group-color-dot" style={{ backgroundColor: group.color }} />
          <h2 className="group-name">{group.name}</h2>
          <span className="group-count">{bookmarkCount} 条</span>
          {!isInbox && (
            <span className="group-actions">
              <button type="button" onClick={startEdit}>
                编辑分组
              </button>
              <button type="button" onClick={() => setMode('delete')}>
                删除分组
              </button>
            </span>
          )}
        </>
      )}
    </div>
  )
}
