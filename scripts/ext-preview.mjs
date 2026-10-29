/**
 * 真实扩展预览:完整 Chromium(WSLg 有头窗口)+ --load-extension 加载 dist。
 * 预置与 preview harness 相同的种子数据到 chrome.storage.local,再截图。
 * 进程保持存活 → 桌面窗口不关,可直接上手操作(拖拽/折叠/搜索)。
 *   DISPLAY=:0 LD_LIBRARY_PATH=... node scripts/ext-preview.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const dist = new URL("../dist", import.meta.url).pathname;
const outDir = ".scratch/ui-preview";
mkdirSync(outDir, { recursive: true });

const seed = {
  schemaVersion: 1,
  groups: [
    { id: "inbox", name: "收集箱", color: "#3b82f6", order: 0 },
    { id: "g-dev", name: "前端开发", color: "#81a2be", order: 1 },
    { id: "g-news", name: "资讯阅读", color: "#f0c674", order: 2 },
    { id: "g-design", name: "设计灵感", color: "#b294bb", order: 3 },
    { id: "g-video", name: "影视娱乐", color: "#cc6666", order: 4 },
  ],
  bookmarks: [
    {
      id: "b1",
      url: "https://web.dev/articles/view-transitions",
      title: "View Transitions API - web.dev",
      note: "给分组折叠加过渡?",
      groupId: "inbox",
      order: 0,
    },
    {
      id: "b2",
      url: "https://alist.example.com",
      title: "AList 文档",
      note: "",
      groupId: "inbox",
      order: 1,
    },
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

const context = await chromium.launchPersistentContext(
  "/tmp/chrome-ext-profile",
  {
    executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
    headless: false,
    viewport: { width: 1380, height: 940 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
      "--window-size=1380,960",
    ],
  }
);

// 找到扩展的 service worker → 推导扩展 id
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
console.log("extension id:", extId);

// 先打开扩展页(空状态),从页面上下文写入种子数据,再重载
const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/src/newtab/index.html`);
await page.waitForSelector(".page", { timeout: 15000 });
await page.evaluate((s) => chrome.storage.local.set({ state: s }), seed);
await page.reload();
await page.waitForSelector(".group", { timeout: 15000 });
await page.waitForTimeout(2500); // 等 favicon 拉取

await page.screenshot({ path: `${outDir}/ext-light.png`, fullPage: true });
console.log("✓ ext-light.png");

await page.emulateMedia({ colorScheme: "dark" });
await page.waitForTimeout(400);
await page.screenshot({ path: `${outDir}/ext-dark.png`, fullPage: true });
console.log("✓ ext-dark.png");
await page.emulateMedia({ colorScheme: "light" });

console.log("窗口保持打开,可直接操作。Ctrl+C 结束。");
// 保持进程存活,窗口不关
setInterval(() => {}, 1 << 30);
