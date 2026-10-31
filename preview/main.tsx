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
  // 待办卡(todo-card,ADR-0006):与分组卡并排的清单卡样例,
  // 含未完成/完成混排供视觉评审;第二张演示自由宽(674px)与卡色
  // 底染(todo-card-size-color)
  todos: [
    {
      id: "t-preview",
      title: "今日待办",
      order: 0,
      x: 810,
      y: 560,
      items: [
        { id: "ti-1", text: "回 design review 评论", done: false, order: 0 },
        { id: "ti-2", text: "发布 v0.4 预览包", done: false, order: 1 },
        { id: "ti-3", text: "整理收藏分组", done: true, order: 2 },
      ],
    },
    {
      id: "t-wide",
      title: "本周计划",
      order: 1,
      x: 0,
      y: 1240,
      width: 674,
      color: "#9fe295",
      items: [
        {
          id: "tj-1",
          text: "读完《设计中的设计》第三章",
          done: false,
          order: 0,
        },
        { id: "tj-2", text: "整理新标签页需求清单", done: false, order: 1 },
        { id: "tj-3", text: "给扩展拍一组截图", done: true, order: 2 },
      ],
    },
    // 定长高样例(todo-height-archive):height 钉住卡高,条目溢出
    // 在列表区滚动;含已完成条目供归档钮视觉评审
    {
      id: "t-fixed",
      title: "迭代清单",
      order: 2,
      x: 810,
      y: 1240,
      height: 320,
      items: [
        { id: "tk-1", text: "定长拖柄交互走查", done: false, order: 0 },
        { id: "tk-2", text: "归档钮禁用态检查", done: false, order: 1 },
        { id: "tk-3", text: "深浅色截图", done: true, order: 2 },
        { id: "tk-4", text: "更新 CHANGELOG", done: false, order: 3 },
        { id: "tk-5", text: "回复 issue 反馈", done: true, order: 4 },
        { id: "tk-6", text: "准备周会演示", done: false, order: 5 },
        { id: "tk-7", text: "归档本月已完成", done: true, order: 6 },
        { id: "tk-8", text: "整理素材库", done: false, order: 7 },
        { id: "tk-9", text: "补充视觉验收清单", done: false, order: 8 },
        { id: "tk-10", text: "归档旧迭代卡", done: true, order: 9 },
      ],
    },
  ],
  groups: [
    {
      id: INBOX_GROUP_ID,
      name: "收集箱",
      color: INBOX_GROUP_COLOR,
      order: 0,
      x: 0,
      y: 0,
    },
    // 档位/每行条数各异(group-span-decouple):装满 3 档 / 装满 2 档 /
    // 缺省单列 / 清单式(span 4 + 一行 1 条,条目拉满整行)混排,
    // 供视觉评审;组宽随档位推导
    {
      id: "g-dev",
      name: "前端开发",
      color: "#35b8e0",
      order: 1,
      x: 0,
      y: 260,
      columns: 3,
    },
    {
      id: "g-news",
      name: "资讯阅读",
      color: "#de935f",
      order: 2,
      x: 0,
      y: 560,
      columns: 2,
    },
    {
      id: "g-design",
      name: "设计灵感",
      color: "#e57bb4",
      order: 3,
      x: 810,
      y: 0,
    },
    {
      id: "g-video",
      name: "影视娱乐",
      color: "#cc6666",
      order: 4,
      x: 630,
      y: 260,
    },
    // 清单式:拖宽到 4 档后表单改一行 1 条——宽组保持、条目拉满整行
    {
      id: "g-tools",
      name: "常用工具",
      color: "#8abeb7",
      order: 5,
      x: 0,
      y: 880,
      span: 4,
      columns: 1,
    },
    // 定长高样例(group-height):height 钉住组高,收藏溢出在网格区
    // 滚动、组头常驻;与 t-fixed 待办卡同场对比两卡语言的一致性
    {
      id: "g-reading",
      name: "稍后阅读",
      color: "#a9dc76",
      order: 6,
      x: 0,
      y: 1600,
      columns: 3,
      height: 320,
    },
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
    // 常用工具(清单式样例)
    {
      id: "b50",
      url: "https://excalidraw.com",
      title: "Excalidraw",
      note: "",
      groupId: "g-tools",
      order: 0,
    },
    {
      id: "b51",
      url: "https://www.remove.bg",
      title: "remove.bg",
      note: "",
      groupId: "g-tools",
      order: 1,
    },
    {
      id: "b52",
      url: "https://tinypng.com",
      title: "TinyPNG",
      note: "",
      groupId: "g-tools",
      order: 2,
    },
    // 稍后阅读(定长高样例,group-height):条数溢出供滚动走查
    ...Array.from({ length: 24 }, (_, i) => ({
      id: `b6-${i}`,
      url: `https://read.example.com/${i + 1}`,
      title: `稍后读·第 ${i + 1} 篇`,
      note: "",
      groupId: "g-reading",
      order: i,
    })),
  ],
};

const adapter = createMemoryStorage(seed);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App adapter={adapter} />
  </StrictMode>
);
