import type { BookmarkState, StorageAdapter } from '../domain/types'

/** chrome.storage.local 中的单一状态对象键名。 */
const STATE_KEY = 'state'

/**
 * chrome.storage.local 存储适配器(真实实现)。
 * 薄封装、无自身逻辑,按 spec Testing Decisions 不单测,靠 dist 冒烟覆盖。
 */
export function createChromeStorage(): StorageAdapter {
  return {
    async load(): Promise<BookmarkState | null> {
      const got = await chrome.storage.local.get(STATE_KEY)
      return (got[STATE_KEY] as BookmarkState | undefined) ?? null
    },
    async save(state: BookmarkState): Promise<void> {
      await chrome.storage.local.set({ [STATE_KEY]: state })
    },
    subscribe(listener: () => void): () => void {
      const onChange = (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: string,
      ): void => {
        // chrome 会在所有注册监听的上下文触发(含写入方自身)
        if (areaName === 'local' && STATE_KEY in changes) listener()
      }
      chrome.storage.onChanged.addListener(onChange)
      return () => chrome.storage.onChanged.removeListener(onChange)
    },
  }
}
