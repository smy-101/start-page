import { useState } from "react";
import type { BookmarkState, StorageAdapter } from "../domain/types";
import type { NativeBookmarkNode } from "../domain/nativeImport";
import { importNativeBookmarks } from "../domain/nativeImport";
import { getNativeBookmarkTree } from "./nativeBookmarks";
import { importReportText } from "./messages";
import { ImportExport } from "./ImportExport";
import { ArrowLeftIcon } from "./Icon";
import type { BackgroundSetting } from "./settings";
import { BACKGROUND_COLOR_PALETTE } from "./colors";
import { compressBackgroundImage } from "./backgroundImage";

/** 取色器未选色时的兜底显示色:策展色板首色(雾白,近默认浅底)。 */
const DEFAULT_PICKER_COLOR = BACKGROUND_COLOR_PALETTE[0];

type SettingsViewProps = {
  onBack: () => void;
  /** 导入导出与原生书签导入共用收藏状态与存储适配器 */
  state: BookmarkState;
  adapter: StorageAdapter;
  /** 导入成功后回调(父层重载状态) */
  onImported: () => void;
  /** chrome.bookmarks 树读取缝隙(测试注入假树) */
  getBookmarkTree?: () => Promise<NativeBookmarkNode[]>;
  /** 图标抓取开关(board-refresh/05) */
  iconFetch: boolean;
  onToggleIconFetch(enabled: boolean): void;
  /** 当前背景(GLOSSARY「背景」)与变更上报;持久化在 App 层 */
  background: BackgroundSetting;
  onBackgroundChange(next: BackgroundSetting): void;
  /** 图片压缩缝隙;测试注入假实现,缺省真实管线 */
  compressImage?: (file: File) => Promise<string>;
};

/**
 * 设置页:从浏览器书签导入、导入导出。(搜索引擎已迁至搜索胶囊,ui-refresh/03。)
 * 深浅色跟随系统(全局 CSS 变量),全中文。
 */
export function SettingsView({
  onBack,
  state,
  adapter,
  onImported,
  getBookmarkTree = getNativeBookmarkTree,
  iconFetch,
  onToggleIconFetch,
  background,
  onBackgroundChange,
  compressImage = compressBackgroundImage,
}: SettingsViewProps) {
  const [nativeReport, setNativeReport] = useState<string | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  /** 上传即压缩,成功上报图片背景;失败就地提示、不改动背景 */
  async function handleBackgroundFile(file: File | undefined) {
    if (!file) return;
    setBackgroundError(null);
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      onBackgroundChange({ kind: "image", dataUrl });
    } catch {
      setBackgroundError("无法读取该图片,请换一张试试");
    } finally {
      setUploading(false);
    }
  }

  async function handleImportNative() {
    try {
      const result = await importNativeBookmarks(
        adapter,
        await getBookmarkTree()
      );
      if (result.ok) {
        setNativeError(null);
        setNativeReport(importReportText(result.value));
        onImported();
      } else {
        // 解析层唯一失败模式:树中无任何可导入书签
        setNativeReport(null);
        setNativeError("浏览器书签为空,没有可导入的书签");
      }
    } catch {
      setNativeReport(null);
      setNativeError("读取浏览器书签失败,请稍后重试");
    }
  }

  return (
    <main className="page settings">
      <header className="settings-header">
        <h1 className="page-title">设置</h1>
        <button type="button" className="back-button" onClick={onBack}>
          <ArrowLeftIcon size={15} />
          返回初始页
        </button>
      </header>

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

      <section className="settings-section" aria-label="网页图标">
        <h2>网页图标</h2>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={iconFetch}
            onChange={(event) => onToggleIconFetch(event.target.checked)}
          />
          <span>
            添加收藏时自动抓取网页图标(需「读取网站数据」授权,拒绝后会关闭此开关)
          </span>
        </label>
        <p className="settings-hint">
          开启后由扩展直接请求网页解析图标并存入本地,离线可用;
          关闭时图标回退浏览器缓存(仅访问过的站点)与首字母方块。
          重新开启后,下次添加收藏时会再次请求授权
        </p>
      </section>

      <section className="settings-section" aria-label="背景">
        <h2>背景</h2>
        <p className="settings-hint">
          仅初始页生效;一份背景深浅色共用,不随 JSON 备份导出
        </p>
        <div
          className="color-swatches background-swatches"
          role="radiogroup"
          aria-label="背景颜色"
        >
          {BACKGROUND_COLOR_PALETTE.map((color) => (
            <label
              key={color}
              className="color-swatch"
              data-selected={
                background.kind === "color" && background.color === color
              }
            >
              <input
                type="radio"
                name="background-color"
                value={color}
                checked={
                  background.kind === "color" && background.color === color
                }
                onChange={() => onBackgroundChange({ kind: "color", color })}
                aria-label={`颜色 ${color}`}
              />
              <span className="color-dot" style={{ backgroundColor: color }} />
            </label>
          ))}
        </div>
        <div className="background-controls">
          <label className="background-custom-color">
            自定义颜色
            <input
              type="color"
              value={
                background.kind === "color"
                  ? background.color
                  : DEFAULT_PICKER_COLOR
              }
              onChange={(event) =>
                onBackgroundChange({
                  kind: "color",
                  color: event.target.value,
                })
              }
            />
          </label>
          <label className="background-upload">
            上传图片
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void handleBackgroundFile(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => onBackgroundChange({ kind: "default" })}
          >
            恢复默认背景
          </button>
        </div>
        {uploading && (
          <p className="import-report" role="status" aria-label="背景处理中">
            处理中…
          </p>
        )}
        {background.kind === "image" && (
          <img
            className="background-preview"
            src={background.dataUrl}
            alt="背景预览"
          />
        )}
        {backgroundError && (
          <p className="form-error" role="alert">
            {backgroundError}
          </p>
        )}
      </section>

      <h2 className="settings-subheading">导入导出</h2>
      <ImportExport state={state} adapter={adapter} onImported={onImported} />
    </main>
  );
}
