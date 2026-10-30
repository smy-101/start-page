import type { EngineId } from "./searchEngine";
import { DEFAULT_ENGINE_ID, resolveEngineId } from "./searchEngine";

/**
 * 应用设置(独立于收藏状态,chrome.storage.local 单独键名存储)。
 * 深浅色跟随系统,无需设置项。
 */
/**
 * 背景(GLOSSARY「背景」):初始页视口级底,一份深浅色共用、仅初始页生效、
 * 不随 JSON 备份导出。default = 跟随石墨/雾纸默认底。
 */
export type BackgroundSetting =
  | { kind: "default" }
  | { kind: "color"; color: string }
  | { kind: "image"; dataUrl: string };

export interface Settings {
  engine: EngineId;
  /** 添加收藏时自动抓取网页图标(board-refresh/05);拒绝授权后自动关闭,可重新打开 */
  iconFetch: boolean;
  /** 自定义背景(默认石墨/雾纸);校正见 resolveBackground */
  background: BackgroundSetting;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: DEFAULT_ENGINE_ID,
  iconFetch: true,
  background: { kind: "default" },
};

/**
 * 设置存储适配器:与收藏状态的 StorageAdapter 同一模式(注入、可换内存实现),
 * 但键名与类型独立——settings 键,不与 state 键混存。
 */
export interface SettingsAdapter {
  load(): Promise<Settings | null>;
  save(settings: Settings): Promise<void>;
}

/** chrome.storage.local 的设置键名(与收藏状态键 state 分开)。 */
const SETTINGS_KEY = "settings";

/**
 * chrome.storage.local 设置适配器(真实实现)。
 * 薄封装不校正数据(校正集中在可测的 loadSettings),按 spec Testing Decisions 不单测。
 */
export function createChromeSettingsStorage(): SettingsAdapter {
  return {
    async load(): Promise<Settings | null> {
      const got = await chrome.storage.local.get(SETTINGS_KEY);
      return (got[SETTINGS_KEY] as Settings | undefined) ?? null;
    },
    async save(settings: Settings): Promise<void> {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    },
  };
}

/** 内存设置适配器(测试与持久化模拟)。 */
export function createMemorySettingsStorage(
  initial: Settings | null = null
): SettingsAdapter {
  let settings: Settings | null = initial;
  return {
    async load() {
      return settings;
    },
    async save(next) {
      settings = next;
    },
  };
}

/** 十六进制 #rrggbb(取色器与色板的产出形状;归一为小写)。 */
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/** 背景白名单校正:非法形状一律回退默认,不抛错。 */
function resolveBackground(raw: unknown): BackgroundSetting {
  if (typeof raw === "object" && raw !== null && "kind" in raw) {
    const candidate = raw as {
      kind: unknown;
      color?: unknown;
      dataUrl?: unknown;
    };
    if (
      candidate.kind === "color" &&
      typeof candidate.color === "string" &&
      HEX_COLOR_RE.test(candidate.color)
    ) {
      return { kind: "color", color: candidate.color.toLowerCase() };
    }
    if (
      candidate.kind === "image" &&
      typeof candidate.dataUrl === "string" &&
      candidate.dataUrl.startsWith("data:image/")
    ) {
      return { kind: "image", dataUrl: candidate.dataUrl };
    }
  }
  return { kind: "default" };
}

/**
 * 读取设置:逐项校正——引擎白名单外回退默认必应;
 * iconFetch 仅在显式存了 false 时关闭(undefined = 旧版设置,取默认开);
 * 背景白名单外回退默认底(resolveBackground)。
 */
export async function loadSettings(
  adapter: SettingsAdapter
): Promise<Settings> {
  const stored = await adapter.load();
  if (stored === null) return DEFAULT_SETTINGS;
  return {
    engine: resolveEngineId(stored.engine),
    iconFetch: stored.iconFetch !== false,
    background: resolveBackground(stored.background),
  };
}
