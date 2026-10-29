import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");

/**
 * 回归门禁(来自 2026-10-28 构建 retro):
 * - 术语:GLOSSARY 规定页面名只用「初始页」,「起始页」仅允许作为项目名/搜索输入出现在测试里
 * - 纯度:领域层零 chrome.* 运行时依赖(spec 硬约束,ADR-0001)
 * 机械规则进门禁不进文档;变更术语约定请先改 GLOSSARY.md。
 */

function isTestFile(name: string): boolean {
  return /\.test\.[jt]sx?$/.test(name);
}

/** 递归收集目录下指定后缀的非测试源文件。 */
function sourceFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full, exts));
    } else if (exts.some((e) => name.endsWith(e)) && !isTestFile(name)) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉行注释与块注释后的源码文本。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("回归门禁:术语", () => {
  it("src 非测试源码不出现「起始页」(页面名统一用「初始页」)", () => {
    const files = sourceFiles(srcRoot, [".ts", ".tsx"]).filter(
      (f) => !f.includes("guards.test")
    );
    const offenders = files.filter((f) =>
      readFileSync(f, "utf8").includes("起始页")
    );
    expect(
      offenders,
      `以下文件出现「起始页」,页面名应为「初始页」(见 GLOSSARY.md):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("回归门禁:领域层纯度", () => {
  it("src/domain 非测试源码(去注释后)不含 chrome.* 运行时调用", () => {
    const files = sourceFiles(join(srcRoot, "domain"), [".ts"]);
    const offenders = files.filter((f) =>
      /chrome\s*\./.test(stripComments(readFileSync(f, "utf8")))
    );
    expect(
      offenders,
      `领域层出现 chrome.* 调用,违反零依赖约束(spec / ADR-0001):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
