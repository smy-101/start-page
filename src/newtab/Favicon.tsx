import { useState } from "react";
import type { CSSProperties } from "react";

type FaviconProps = {
  pageUrl: string;
  title: string;
  /** 回退色块的底色(取所属分组颜色) */
  fallbackColor: string;
};

function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "32");
  return url.toString();
}

/**
 * 收藏卡片图标:经扩展 `_favicon` 端点(本地缓存、离线可用);
 * onError 与 naturalWidth === 0(默认图)双保险回退首字母色块。
 */
export function Favicon({ pageUrl, title, fallbackColor }: FaviconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
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
  return (
    <img
      className="favicon"
      src={faviconUrl(pageUrl)}
      alt=""
      onError={() => setFailed(true)}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0) setFailed(true);
      }}
    />
  );
}
