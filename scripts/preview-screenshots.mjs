/**
 * 预览页截图脚本(本地视觉评审用,不进扩展构建):
 *   node scripts/preview-screenshots.mjs [outDir]
 * 依赖:vite dev server 已在 5173 端口;chrome-headless-shell 已就位。
 */
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const outDir = process.argv[2] ?? ".scratch/ui-preview";
const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:5173";

function findHeadlessShell() {
  const root = join(homedir(), ".cache", "ms-playwright");
  for (const dir of readdirSync(root)) {
    if (!dir.startsWith("chromium_headless_shell")) continue;
    for (const sub of readdirSync(join(root, dir))) {
      if (sub.includes("chrome-headless-shell-linux")) {
        return join(root, dir, sub, "chrome-headless-shell");
      }
    }
  }
  throw new Error(
    "chrome-headless-shell not found; run: npx playwright install chromium-headless-shell"
  );
}

const browser = await chromium.launch({
  executablePath: findHeadlessShell(),
  args: ["--no-sandbox"],
});

async function shot(
  name,
  { scheme = "light", width = 1360, height = 900, click } = {}
) {
  const page = await browser.newPage({
    viewport: { width, height },
    colorScheme: scheme,
  });
  await page.goto(`${origin}/preview/index.html`);
  await page.waitForSelector(".group", { timeout: 15000 });
  if (click) await page.click(click);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.close();
  console.log(`✓ ${name}.png`);
}

await shot("light-wide");
await shot("dark-wide", { scheme: "dark" });
await shot("light-narrow", { width: 430, height: 900 });
await shot("dark-settings", { scheme: "dark", click: ".gear-button" });
await shot("light-settings", { click: ".gear-button" });

await browser.close();
console.log("done →", outDir);
