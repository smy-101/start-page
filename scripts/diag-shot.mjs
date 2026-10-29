/**
 * board-refresh 验收截图:亮/暗、编辑模式、折叠、fresh 引导。
 *   LD_LIBRARY_PATH=... node scripts/diag-shot.mjs [seeded|fresh]
 */
import { chromium } from "playwright-core";

const mode = process.argv[2] ?? "seeded";
const dist = new URL("../dist", import.meta.url).pathname;
const outDir = ".scratch/board-refresh";

const groups = [
  { id: "inbox", name: "收集箱", color: "#3b82f6", order: 0 },
  { id: "g-dev", name: "前端开发", color: "#81a2be", order: 1 },
  { id: "g-news", name: "资讯阅读", color: "#f0c674", order: 2 },
  { id: "g-design", name: "设计灵感", color: "#b294bb", order: 3 },
  { id: "g-video", name: "影视娱乐", color: "#cc6666", order: 4 },
];
const mk = (id, url, title, groupId, order) => ({
  id,
  url,
  title,
  note: "",
  groupId,
  order,
});
const seed =
  mode === "fresh"
    ? { schemaVersion: 2, groups: [groups[0]], bookmarks: [] }
    : {
        schemaVersion: 2,
        groups,
        bookmarks: [
          mk("b1", "https://web.dev", "View Transitions", "inbox", 0),
          mk("b2", "https://alist.example.com", "AList 文档", "inbox", 1),
          mk("b10", "https://react.dev", "React 官方文档", "g-dev", 0),
          mk(
            "b11",
            "https://developer.mozilla.org/zh-CN/",
            "MDN Web Docs",
            "g-dev",
            1
          ),
          mk(
            "b12",
            "https://www.typescriptlang.org/docs/",
            "TypeScript 文档",
            "g-dev",
            2
          ),
          mk(
            "b13",
            "https://github.com/trending",
            "GitHub Trending",
            "g-dev",
            3
          ),
          mk("b14", "https://caniuse.com", "Can I use", "g-dev", 4),
          mk("b15", "https://vitejs.dev", "Vite", "g-dev", 5),
          mk("b16", "https://stackoverflow.com", "Stack Overflow", "g-dev", 6),
          mk("b17", "https://www.npmjs.com", "npm", "g-dev", 7),
          mk("b18", "https://vite.dev/guide/", "Vite 指南", "g-dev", 8),
          mk("b19", "https://vitest.dev", "Vitest", "g-dev", 9),
          mk("b20", "https://sspai.com", "少数派", "g-news", 0),
          mk("b21", "https://www.v2ex.com", "V2EX", "g-news", 1),
          mk(
            "b22",
            "https://www.ruanyifeng.com/blog/",
            "阮一峰的网络日志",
            "g-news",
            2
          ),
          mk("b23", "https://www.huxiu.com", "虎嗅", "g-news", 3),
          mk("b30", "https://dribbble.com", "Dribbble", "g-design", 0),
          mk("b31", "https://www.figma.com/files", "Figma", "g-design", 1),
          mk("b32", "https://mobbin.com", "Mobbin", "g-design", 2),
          mk("b33", "https://www.awwwards.com", "Awwwards", "g-design", 3),
          mk("b40", "https://www.bilibili.com", "哔哩哔哩", "g-video", 0),
          mk("b41", "https://www.youtube.com", "YouTube", "g-video", 1),
          mk("b42", "https://movie.douban.com", "豆瓣电影", "g-video", 2),
        ],
      };

const context = await chromium.launchPersistentContext(
  `/tmp/chrome-ext-shot-${mode}`,
  {
    executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
    headless: true,
    viewport: { width: 1920, height: 1000 },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
    ],
  }
);
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
const page = await context.newPage();
await page.goto(`chrome-extension://${extId}/src/newtab/index.html`);
await page.waitForSelector(".page", { timeout: 15000 });
await page.evaluate((s) => chrome.storage.local.set({ state: s }), seed);
await page.reload();
await page.waitForSelector(".page", { timeout: 15000 });
await page.waitForTimeout(1200);

if (mode === "fresh") {
  await page.screenshot({ path: `${outDir}/fresh-cta.png` });
} else {
  await page.screenshot({ path: `${outDir}/light-board.png`, fullPage: true });
  // 折叠两个组
  await page.click('section[aria-label="设计灵感"] .collapse-toggle');
  await page.click('section[aria-label="影视娱乐"] .collapse-toggle');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${outDir}/light-collapsed.png`,
    fullPage: true,
  });
  // 展开回来,进编辑模式
  await page.click('section[aria-label="设计灵感"] .collapse-toggle');
  await page.click('section[aria-label="影视娱乐"] .collapse-toggle');
  await page.click(".edit-toggle");
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/light-edit.png`, fullPage: true });
  await page.click(".edit-toggle");
  // 深色
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/dark-board.png`, fullPage: true });
}
await context.close();
console.log(`✓ ${mode} 截图完成`);
