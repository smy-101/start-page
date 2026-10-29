import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./chrome-shim.js";
import "../src/newtab/index.css";
import { App } from "../src/newtab/App";
import { createMemoryStorage } from "../src/storage/memoryStorage";
import {
  INBOX_GROUP_COLOR,
  INBOX_GROUP_ID,
  SCHEMA_VERSION,
} from "../src/domain/types";
import type { BookmarkState } from "../src/domain/types";

/**
 * 本地预览 harness:内存存储 + 逼真的中文种子数据,供视觉评审与截图。
 * 不进扩展构建(manifest 不含此入口)。
 */
const seed: BookmarkState = {
  schemaVersion: SCHEMA_VERSION,
  groups: [
    { id: INBOX_GROUP_ID, name: "收集箱", color: INBOX_GROUP_COLOR, order: 0 },
    { id: "g-dev", name: "前端开发", color: "#81a2be", order: 1 },
    { id: "g-news", name: "资讯阅读", color: "#f0c674", order: 2 },
    { id: "g-design", name: "设计灵感", color: "#b294bb", order: 3 },
    { id: "g-video", name: "影视娱乐", color: "#cc6666", order: 4 },
  ],
  bookmarks: [
    // 收集箱:随手收藏、还没归类的
    {
      id: "b1",
      url: "https://web.dev/articles/view-transitions",
      title: "View Transitions API - web.dev",
      note: "给分组折叠加过渡?",
      groupId: INBOX_GROUP_ID,
      order: 0,
    },
    {
      id: "b2",
      url: "https://alist.example.com",
      title: "AList 文档",
      note: "",
      groupId: INBOX_GROUP_ID,
      order: 1,
    },
    // 前端开发
    {
      id: "b10",
      url: "https://react.dev",
      title: "React 官方文档",
      note: "",
      groupId: "g-dev",
      order: 0,
    },
    {
      id: "b11",
      url: "https://developer.mozilla.org/zh-CN/",
      title: "MDN Web Docs",
      note: "查 API 第一站",
      groupId: "g-dev",
      order: 1,
    },
    {
      id: "b12",
      url: "https://www.typescriptlang.org/docs/",
      title: "TypeScript 文档",
      note: "",
      groupId: "g-dev",
      order: 2,
    },
    {
      id: "b13",
      url: "https://github.com/trending",
      title: "GitHub Trending",
      note: "每天刷一眼",
      groupId: "g-dev",
      order: 3,
    },
    {
      id: "b14",
      url: "https://caniuse.com",
      title: "Can I use",
      note: "",
      groupId: "g-dev",
      order: 4,
    },
    {
      id: "b15",
      url: "https://vitejs.dev",
      title: "Vite",
      note: "",
      groupId: "g-dev",
      order: 5,
    },
    {
      id: "b16",
      url: "https://stackoverflow.com",
      title: "Stack Overflow",
      note: "",
      groupId: "g-dev",
      order: 6,
    },
    {
      id: "b17",
      url: "https://www.npmjs.com",
      title: "npm",
      note: "",
      groupId: "g-dev",
      order: 7,
    },
    // 资讯阅读
    {
      id: "b20",
      url: "https://sspai.com",
      title: "少数派",
      note: "",
      groupId: "g-news",
      order: 0,
    },
    {
      id: "b21",
      url: "https://www.v2ex.com",
      title: "V2EX",
      note: "",
      groupId: "g-news",
      order: 1,
    },
    {
      id: "b22",
      url: "https://www.ruanyifeng.com/blog/",
      title: "阮一峰的网络日志",
      note: "每周五看周刊",
      groupId: "g-news",
      order: 2,
    },
    {
      id: "b23",
      url: "https://www.huxiu.com",
      title: "虎嗅",
      note: "",
      groupId: "g-news",
      order: 3,
    },
    // 设计灵感
    {
      id: "b30",
      url: "https://dribbble.com",
      title: "Dribbble",
      note: "",
      groupId: "g-design",
      order: 0,
    },
    {
      id: "b31",
      url: "https://www.figma.com/files",
      title: "Figma",
      note: "桌面版更快",
      groupId: "g-design",
      order: 1,
    },
    {
      id: "b32",
      url: "https://mobbin.com",
      title: "Mobbin",
      note: "找界面参考",
      groupId: "g-design",
      order: 2,
    },
    {
      id: "b33",
      url: "https://www.awwwards.com",
      title: "Awwwards",
      note: "",
      groupId: "g-design",
      order: 3,
    },
    // 影视娱乐
    {
      id: "b40",
      url: "https://www.bilibili.com",
      title: "哔哩哔哩",
      note: "",
      groupId: "g-video",
      order: 0,
    },
    {
      id: "b41",
      url: "https://www.youtube.com",
      title: "YouTube",
      note: "",
      groupId: "g-video",
      order: 1,
    },
    {
      id: "b42",
      url: "https://movie.douban.com",
      title: "豆瓣电影",
      note: "",
      groupId: "g-video",
      order: 2,
    },
  ],
};

const adapter = createMemoryStorage(seed);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App adapter={adapter} />
  </StrictMode>
);
