import { useState } from 'react'
import type { NewGroupInput } from '../domain/store'
import type { Group, Result } from '../domain/types'
import { GROUP_COLOR_PALETTE } from './colors'
import { ColorSwatches } from './ColorSwatches'
import { domainErrorText } from './messages'

type NewGroupFormProps = {
  onCreate: (input: NewGroupInput) => Promise<Result<Group>>
}

/** 新建分组表单(名字 + 颜色),成功后清空名字、保留所选色。 */
export function NewGroupForm({ onCreate }: NewGroupFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(GROUP_COLOR_PALETTE[0])
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const result = await onCreate({ name, color })
    if (result.ok) {
      setName('')
      setError(null)
    } else {
      setError(domainErrorText[result.error])
    }
  }

  return (
    <form className="new-group-form" onSubmit={handleSubmit}>
      <label htmlFor="new-group-name">分组名</label>
      <input
        id="new-group-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="如:工作"
        autoComplete="off"
      />
      <ColorSwatches name="new-group-color" value={color} onChange={setColor} />
      <button type="submit">新建分组</button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
