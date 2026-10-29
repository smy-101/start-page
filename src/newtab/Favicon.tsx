import { useRef, useState } from "react";
import type { CSSProperties } from "react";

type FaviconProps = {
  pageUrl: string;
  title: string;
  /** 回退色块的底色(取所属分组颜色) */
  fallbackColor: string;
  /** 添加时抓取存的网页图标 data URL(schema v2,board-refresh/05);优先于浏览器缓存 */
  iconDataUrl?: string;
};

function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

/**
 * 收藏卡片图标,三级回退链(board-refresh/05):
 * 抓取存的 data URL(离线可用)→ 扩展 _favicon 端点(访问过站点的本地缓存)
 * → 首字母色块(onError 与 naturalWidth === 0 双保险)。
 */
export function Favicon({
  pageUrl,
  title,
  fallbackColor,
  iconDataUrl,
}: FaviconProps) {
  const [stage, setStage] = useState<"stored" | "browser" | "letter">(
    iconDataUrl ? "stored" : "browser"
  );
  // 图标 data URL 变化(编辑/回填)时重置回退阶段(render 期校正 state 的标准模式)
  const prevIcon = useRef(iconDataUrl);
  if (prevIcon.current !== iconDataUrl) {
    prevIcon.current = iconDataUrl;
    setStage(iconDataUrl ? "stored" : "browser");
  }

  if (stage === "letter") {
    return (
      <span
        className="favicon-tile"
        style={{ "--tile-color": fallbackColor } as CSSProperties}
        aria-hidden="true"
      >
        {(title.trim().charAt(0) || "?").toUpperCase()}
      </span>
    );
  }

  if (stage === "stored") {
    return (
      <img
        className="favicon"
        src={iconDataUrl}
        alt=""
        onError={() => setStage("browser")}
      />
    );
  }

  return (
    <img
      className="favicon"
      src={faviconUrl(pageUrl)}
      alt=""
      onError={() => setStage("letter")}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0) setStage("letter");
      }}
    />
  );
}
