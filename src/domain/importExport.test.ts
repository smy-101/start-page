import { describe, expect, it } from 'vitest'
import type { BookmarkState } from './types'
import { INBOX_GROUP_ID } from './types'
import { exportStateAsJson } from './importExport'

/** 与实现无耦合的字面量状态:导出/导入回环的独立真值来源。 */
export function literalState(): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      { id: INBOX_GROUP_ID, name: '收集箱', color: '#3b82f6', order: 0 },
      { id: 'g-work', name: '工作', color: '#f97316', order: 1 },
      { id: 'g-dev', name: '开发', color: '#22c55e', order: 2 },
    ],
    bookmarks: [
      {
        id: 'b-1',
        url: 'https://example.com',
        title: '示例站',
        note: '第一条备注',
        groupId: INBOX_GROUP_ID,
        order: 0,
      },
      {
        id: 'b-2',
        url: 'https://git.example.com/org/repo?tab=readme',
        title: '代码仓库',
        note: '',
        groupId: 'g-work',
        order: 0,
      },
      {
        id: 'b-3',
        url: 'http://localhost:5173/',
        title: '本地开发服',
        note: '仅本机',
        groupId: 'g-dev',
        order: 0,
      },
    ],
  }
}

describe('导出 JSON:完整状态逐字备份', () => {
  it('导出内容 JSON.parse 后与原状态深度相等(含 schemaVersion/颜色/顺序/备注)', () => {
    const state = literalState()

    const raw = exportStateAsJson(state)

    expect(JSON.parse(raw)).toEqual(state)
    expect(JSON.parse(raw).schemaVersion).toBe(1)
  })
})
