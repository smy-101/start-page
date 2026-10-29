type ImportCtaProps = {
  onImport(): void;
  onManualAdd(): void;
  importing: boolean;
};

/**
 * 全新安装空状态(board-refresh/06):仅收集箱、零收藏时页面中央的初始化引导,
 * 「从浏览器书签导入」一键初始化;有任何收藏后自然消失(不再渲染本组件)。
 */
export function ImportCta({
  onImport,
  onManualAdd,
  importing,
}: ImportCtaProps) {
  return (
    <section className="fresh-cta" aria-label="初始化引导">
      <p className="fresh-cta-title">把浏览器书签导进来</p>
      <p className="fresh-cta-hint">
        一键导入现有书签:文件夹转为分组、散项进收集箱,重复网址自动跳过
      </p>
      <div className="fresh-cta-actions">
        <button
          type="button"
          className="primary"
          onClick={onImport}
          disabled={importing}
        >
          {importing ? "导入中…" : "从浏览器书签导入"}
        </button>
        <button type="button" onClick={onManualAdd}>
          手动添加收藏
        </button>
      </div>
    </section>
  );
}
