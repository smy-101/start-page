#!/usr/bin/env node
/**
 * CLI 形态:不经 MCP 直接打印收集箱(调试/脚本复用)。
 *   node cli.mjs            # 收集箱视图(默认取数据最新的浏览器)
 *   node cli.mjs full       # 全量看板视图
 *   node cli.mjs sources    # 列出所有识别到的初曦数据源
 */
import { scanStates, inboxView, fullView } from "./lib/scan.mjs";

const mode = process.argv[2] ?? "inbox";
const sources = await scanStates();

if (sources.length === 0) {
  console.error(
    "未找到初曦数据(扫描了所有 Chromium 浏览器 profile 的 Local Extension Settings)"
  );
  process.exit(1);
}

if (mode === "sources") {
  console.log(
    JSON.stringify(
      sources.map(({ state, ...meta }) => ({
        ...meta,
        totals: {
          groups: state.groups.length,
          bookmarks: state.bookmarks.length,
        },
      })),
      null,
      2
    )
  );
} else if (mode === "full") {
  console.log(JSON.stringify(fullView(sources[0]), null, 2));
} else {
  console.log(JSON.stringify(inboxView(sources[0]), null, 2));
}
