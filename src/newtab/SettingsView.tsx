import { useState } from "react";
import type { BookmarkState, StorageAdapter } from "../domain/types";
import type { NativeBookmarkNode } from "../domain/nativeImport";
import { importNativeBookmarks } from "../domain/nativeImport";
import { getNativeBookmarkTree } from "./nativeBookmarks";
import { importReportText } from "./messages";
import { ImportExport } from "./ImportExport";
import { ArrowLeftIcon } from "./Icon";

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
}: SettingsViewProps) {
  const [nativeReport, setNativeReport] = useState<string | null>(null);
  const [nativeError, setNativeError] = useState<string | null>(null);

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

      <h2 className="settings-subheading">导入导出</h2>
      <ImportExport state={state} adapter={adapter} onImported={onImported} />
    </main>
  );
}
