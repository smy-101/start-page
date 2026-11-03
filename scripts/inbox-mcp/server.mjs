#!/usr/bin/env node
/**
 * 初曦收集箱 MCP server(stdio 形态)。
 * 装法:pi mcp add start-page-inbox -- node <本目录>/server.mjs
 *
 * 工具:
 *   get_inbox      读取收集箱全部收藏(自动选数据最新的浏览器)
 *   get_full_state 读取整个看板(分组/全部收藏/待办卡,剥 icon)
 *   list_sources   列出识别到的所有初曦数据源(多浏览器装机排查用)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { scanStates, inboxView, fullView } from "./lib/scan.mjs";

const server = new McpServer({ name: "start-page-inbox", version: "0.1.0" });

const text = (obj) => ({
  content: [{ type: "text", text: JSON.stringify(obj, null, 2) }],
});

/** 三个工具共性:纯本地只读扫描,无副作用、不碰外部服务。 */
const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

async function latestSource() {
  const sources = await scanStates();
  if (sources.length === 0) {
    throw new Error(
      "未找到初曦数据:扫描了所有 Chromium 浏览器(Edge/Chrome/Brave/Vivaldi/Chromium/Opera)profile 的 Local Extension Settings,没有可解析的初曦状态。请确认至少在一个浏览器里装并使用过初曦。"
    );
  }
  return sources[0];
}

server.tool(
  "get_inbox",
  "读取「初曦」新标签页扩展收集箱(inbox 分组)的全部收藏:标题、URL、备注、顺序。自动扫描本机所有 Chromium 浏览器,取数据最新的一份(跟随用户当前活跃浏览器)。返回含数据时间戳与过期小时数。",
  {},
  ANNOTATIONS,
  async () => text(inboxView(await latestSource()))
);

server.tool(
  "get_full_state",
  "读取「初曦」扩展的整个看板状态:全部分组(含统计)、全部收藏(按分组)、待办卡。适合跨分组分析;icon 已剥除。默认取数据最新的浏览器。",
  {},
  ANNOTATIONS,
  async () => text(fullView(await latestSource()))
);

server.tool(
  "list_sources",
  "列出本机识别到的所有初曦数据源(浏览器/profile/扩展目录/数据时间/规模),按新鲜度排序。装机多浏览器时用来核对取的是哪份。",
  {},
  ANNOTATIONS,
  async () => {
    const sources = await scanStates();
    return text(
      sources.map(({ state, ...meta }) => ({
        ...meta,
        totals: {
          groups: state.groups.length,
          bookmarks: state.bookmarks.length,
        },
      }))
    );
  }
);

await server.connect(new StdioServerTransport());
