import { describe, expect, it } from "vitest";
import { fetchSiteMeta, parseIconCandidates } from "../domain/fetchSiteMeta";
import type { FetchSiteMetaDeps } from "../domain/fetchSiteMeta";

function htmlResponse(html: string, type = "text/html; charset=utf-8") {
  return new Response(html, {
    status: 200,
    headers: { "content-type": type },
  });
}

function iconResponse(body = "\u0000\u0001\u0002\u0003", type = "image/png") {
  return new Response(body, { status: 200, headers: { "content-type": type } });
}

const PAGE = "https://example.com/docs/index.html";

describe("parseIconCandidates(纯解析)", () => {
  it("识别 icon/shortcut icon/apple-touch-icon,相对地址按页面解析", () => {
    const { candidates } = parseIconCandidates(
      `<head>
        <link rel="shortcut icon" href="/static/favicon.ico">
        <link rel="apple-touch-icon" sizes="180x180" href="apple.png">
        <link rel="stylesheet" href="ignore.css">
      </head>`,
      PAGE
    );
    // sizes 180 的 apple-touch-icon 优先;无声明的其次;兜底 /favicon.ico 在末
    expect(candidates[0]).toBe("https://example.com/docs/apple.png");
    expect(candidates).toContain("https://example.com/static/favicon.ico");
    expect(candidates).toContain("https://example.com/favicon.ico");
  });

  it("无任何 link 候选时只剩 origin/favicon.ico 兜底", () => {
    const { candidates } = parseIconCandidates(
      "<html><body>空</body></html>",
      PAGE
    );
    expect(candidates).toEqual(["https://example.com/favicon.ico"]);
  });

  it("裸值/单引号属性也能取到 href;sizes=any 胜过未声明,未声明胜过小尺寸声明外的无序", () => {
    const { candidates } = parseIconCandidates(
      `<link rel=icon href=/a.ico>
       <link rel='icon' sizes='16x16' href='/b.ico'>
       <link rel="icon" sizes="any" href="/c.svg">`,
      PAGE
    );
    // any(可缩放 SVG,按 64 分)> 无声明(0)> …;b 声明 16 分应排在 a(无声明)之前
    expect(candidates[0]).toBe("https://example.com/c.svg");
    expect(candidates.indexOf("https://example.com/b.ico")).toBeLessThan(
      candidates.indexOf("https://example.com/a.ico")
    );
    expect(candidates).toContain("https://example.com/a.ico");
  });

  it("解析首个 <title> 并压平空白", () => {
    const { title } = parseIconCandidates(
      "<title>  示例\n  网站 </title><title>第二个</title>",
      PAGE
    );
    expect(title).toBe("示例 网站");
  });
});

describe("fetchSiteMeta(注入 fetch)", () => {
  const makeIcon = () => iconResponse();

  function depsByUrl(
    routes: Record<string, Response>,
    deps: Partial<FetchSiteMetaDeps> = {}
  ): FetchSiteMetaDeps {
    return {
      ...deps,
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        const hit = routes[url];
        if (hit) return hit;
        return new Response("not found", { status: 404 });
      }) as typeof fetch,
    };
  }

  it("抓页面 → 选最大 sizes 的图标 → 转 data URL", async () => {
    const deps = depsByUrl({
      [PAGE]: htmlResponse(
        `<link rel="icon" sizes="32x32" href="/small.png">
         <link rel="icon" sizes="192x192" href="/big.png">`
      ),
      "https://example.com/big.png": makeIcon(),
      "https://example.com/small.png": iconResponse("\u0000", "image/png"),
    });
    const meta = await fetchSiteMeta(PAGE, deps);
    expect(meta.icon).toMatch(/^data:image\/png;base64,/);
    expect(meta.title).toBeUndefined();
  });

  it("首选候选失败时顺延下一个(含 /favicon.ico 兜底)", async () => {
    const deps = depsByUrl({
      [PAGE]: htmlResponse(`<link rel="icon" href="/dead.png">`),
      "https://example.com/favicon.ico": iconResponse("\u0004", "image/x-icon"),
    });
    const meta = await fetchSiteMeta(PAGE, deps);
    expect(meta.icon).toMatch(/^data:image\/x-icon;base64,/);
  });

  it("页面本身是图片时直接用作图标", async () => {
    const deps = depsByUrl({ [PAGE]: makeIcon() });
    const meta = await fetchSiteMeta(PAGE, deps);
    expect(meta.icon).toMatch(/^data:image\/png;base64,/);
  });

  it("非图片内容/超体积图标被放弃,不产出 icon", async () => {
    const deps = depsByUrl({
      [PAGE]: htmlResponse(`<link rel="icon" href="/x.png">`),
      "https://example.com/x.png": htmlResponse(
        "<p>not image</p>",
        "text/html"
      ),
    });
    const meta = await fetchSiteMeta(PAGE, deps);
    expect(meta.icon).toBeUndefined();
  });

  it("页面请求失败/网络异常 → 空结果不抛出", async () => {
    const deps: FetchSiteMetaDeps = {
      fetch: (async () => {
        throw new TypeError("network down");
      }) as typeof fetch,
    };
    await expect(fetchSiteMeta(PAGE, deps)).resolves.toEqual({});
  });
});
