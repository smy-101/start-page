import type { EngineId } from './searchEngine'
import { DEFAULT_ENGINE_ID, resolveEngineId } from './searchEngine'

/**
 * 应用设置(独立于收藏状态,chrome.storage.local 单独键名存储)。
 * 当前仅搜索引擎选择;深浅色跟随系统,无需设置项。
 */
export interface Settings {
  engine: EngineId
}

export const DEFAULT_SETTINGS: Settings = { engine: DEFAULT_ENGINE_ID }

/**
 * 设置存储适配器:与收藏状态的 StorageAdapter 同一模式(注入、可换内存实现),
 * 但键名与类型独立——settings 键,不与 state 键混存。
 */
export interface SettingsAdapter {
  load(): Promise<Settings | null>
  save(settings: Settings): Promise<void>
}

/** chrome.storage.local 的设置键名(与收藏状态键 state 分开)。 */
const SETTINGS_KEY = 'settings'

/**
 * chrome.storage.local 设置适配器(真实实现)。
 * 薄封装不校正数据(校正集中在可测的 loadSettings),按 spec Testing Decisions 不单测。
 */
export function createChromeSettingsStorage(): SettingsAdapter {
  return {
    async load(): Promise<Settings | null> {
      const got = await chrome.storage.local.get(SETTINGS_KEY)
      return (got[SETTINGS_KEY] as Settings | undefined) ?? null
    },
    async save(settings: Settings): Promise<void> {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
    },
  }
}

/** 内存设置适配器(测试与持久化模拟)。 */
export function createMemorySettingsStorage(initial: Settings | null = null): SettingsAdapter {
  let settings: Settings | null = initial
  return {
    async load() {
      return settings
    },
    async save(next) {
      settings = next
    },
  }
}

/** 读取设置:存储值经引擎白名单校正,损坏/未知值回退默认必应。 */
export async function loadSettings(adapter: SettingsAdapter): Promise<Settings> {
  const stored = await adapter.load()
  if (stored === null) return DEFAULT_SETTINGS
  return { engine: resolveEngineId(stored.engine) }
}
