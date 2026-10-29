import { useEffect, useRef, useState } from "react";
import { ENGINES, ENGINE_IDS } from "./searchEngine";
import type { EngineId } from "./searchEngine";

type SearchBoxProps = {
  query: string;
  /** 当前搜索引擎(设置持久化,App 注入) */
  engine: EngineId;
  onChange: (query: string) => void;
  onSearch: (query: string) => void;
  onEngineChange: (engine: EngineId) => void;
};

/**
 * 搜索胶囊:输入即过滤收藏;回车用所选引擎在新标签页搜索。
 * 胶囊左侧引擎按钮点开菜单直接切换引擎(ui-refresh/03,选中即持久化)。
 */
export function SearchBox({
  query,
  engine,
  onChange,
  onSearch,
  onEngineChange,
}: SearchBoxProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // 菜开时点胶囊外关闭:监听 document 指针按下
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  return (
    <div
      className="search-capsule"
      ref={rootRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) setMenuOpen(false);
      }}
    >
      <button
        type="button"
        className="engine-button"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {ENGINES[engine].name}
        <span className="engine-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {menuOpen && (
        <div className="engine-menu" role="listbox" aria-label="搜索引擎">
          {ENGINE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={id === engine}
              className="engine-option"
              onClick={() => {
                onEngineChange(id);
                setMenuOpen(false);
              }}
            >
              {ENGINES[id].name}
            </button>
          ))}
        </div>
      )}
      <input
        className="search-input"
        type="search"
        aria-label="搜索收藏"
        placeholder="搜索标题、网址或备注,回车搜索网页"
        value={query}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSearch(event.currentTarget.value);
        }}
      />
    </div>
  );
}
