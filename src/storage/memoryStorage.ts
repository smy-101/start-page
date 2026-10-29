import type { BookmarkState, StorageAdapter } from '../domain/types'

/**
 * 内存存储适配器:供测试与预置状态。
 * save 保存引用而非拷贝——领域层每次写入都产出新状态对象,不就地修改。
 * subscribe 与 chrome 适配器同语义:save 后通知所有监听者(含写入方自己)。
 */
export function createMemoryStorage(initial: BookmarkState | null = null): StorageAdapter {
  let state: BookmarkState | null = initial
  const listeners = new Set<() => void>()
  return {
    async load() {
      return state
    },
    async save(next) {
      state = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
