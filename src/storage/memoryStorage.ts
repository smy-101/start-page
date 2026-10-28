import type { BookmarkState, StorageAdapter } from '../domain/types'

/**
 * 内存存储适配器:供测试与预置状态。
 * save 保存引用而非拷贝——领域层每次写入都产出新状态对象,不就地修改。
 */
export function createMemoryStorage(initial: BookmarkState | null = null): StorageAdapter {
  let state: BookmarkState | null = initial
  return {
    async load() {
      return state
    },
    async save(next) {
      state = next
    },
  }
}
