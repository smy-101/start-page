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
      if (sub.includes("chrome-headless-shell-linux")) {
        return join(root, dir, sub, "chrome-headless-shell");
      }
    }
  }
  throw new Error("not found");
}
const browser = await chromium.launch({
  executablePath: findHeadlessShell(),
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("console", (m) =>
  console.log("[console]", m.type(), m.text().slice(0, 500))
);
page.on("pageerror", (e) =>
  console.log("[pageerror]", String(e).slice(0, 800))
);
page.on("requestfailed", (r) =>
  console.log("[reqfail]", r.url().slice(0, 120), r.failure()?.errorText)
);
await page.goto(`${origin}/preview/index.html`);
await page.waitForTimeout(4000);
console.log("[root html]", (await page.innerHTML("#root")).slice(0, 300));
await browser.close();
