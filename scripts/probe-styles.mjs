/** 样式探针:验证关键设计决策真实生效(不依赖目测)。 */
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const origin = process.env.PREVIEW_ORIGIN ?? "http://localhost:5175";
function findHeadlessShell() {
  const root = join(homedir(), ".cache", "ms-playwright");
  for (const dir of readdirSync(root)) {
    if (!dir.startsWith("chromium_headless_shell")) continue;
    for (const sub of readdirSync(join(root, dir))) {
      if (sub.includes("chrome-headless-shell-linux"))
        return join(root, dir, sub, "chrome-headless-shell");
    }
  }
  throw new Error("not found");
}
const browser = await chromium.launch({
  executablePath: findHeadlessShell(),
  args: ["--no-sandbox"],
});

async function probe(scheme, width) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme: scheme,
  });
  await page.goto(`${origin}/preview/index.html`);
  await page.waitForSelector(".group");
  const out = await page.evaluate(() => {
    const cs = (sel, prop, pseudo) => {
      const el = document.querySelector(sel);
      return el
        ? getComputedStyle(el, pseudo ?? null).getPropertyValue(prop)
        : "(missing)";
    };
    const wall = document.querySelector(".groups-wall");
    return {
      wallColumns: wall ? getComputedStyle(wall).columnCount : "(missing)",
      pageMaxWidth: cs(".page", "max-width"),
      search: (() => {
        const el = document.querySelector(".search-input");
        if (!el) return "(missing)";
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return `${Math.round(r.width)}x${Math.round(r.height)} radius=${s.borderRadius} shadow=${s.boxShadow.split(")").slice(0, 2).join(")")}…`;
      })(),
      cardTitleColor: cs(".card-title", "color"),
      cardTitleSize: cs(".card-title", "font-size"),
      cardRadius: cs(".card", "border-radius"),
      groupRadius: cs(".group", "border-radius"),
      groupColorVar: cs(".group", "--group-color"),
      spineWidth: cs(".group", "width", "::before"),
      spineBg: cs(".group", "background-color", "::before"),
      submitBtnBg: cs("button[type=submit]", "background-color"),
      submitBtnColor: cs("button[type=submit]", "color"),
      tileBg: cs(".favicon-tile", "background-color"),
      tileSize: cs(".favicon-tile", "width"),
      countPill: cs(".group-count", "background-color"),
      bodyBg: cs("body", "background-color"),
      horizOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      wallChildrenHeights: [...document.querySelectorAll(".group")].map((g) =>
        Math.round(g.getBoundingClientRect().height)
      ),
    };
  });
  console.log(`\n=== ${scheme} @${width} ===`);
  for (const [k, v] of Object.entries(out))
    console.log(`${k}: ${JSON.stringify(v)}`);
  await page.close();
}

await probe("light", 1360);
await probe("dark", 1360);
await probe("light", 430);
await browser.close();
