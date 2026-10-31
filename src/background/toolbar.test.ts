import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createBookmarkStore } from "../domain/store";
import { createMemoryStorage } from "../storage/memoryStorage";
import { iconPathsFor, toolbarStateFor } from "./toolbar";

describe("工具栏图标选择(iconPathsFor)", () => {
  it("已收藏与未收藏同用描边位图(勾走右下角✓徽标),不可收藏用浅灰 disabled", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "x",
    });
    if (!added.ok) throw new Error("fixture setup failed");

    const outline = {
      "16": "icons/outline-16.png",
      "32": "icons/outline-32.png",
    };
    expect(iconPathsFor({ kind: "unfavorited" })).toEqual(outline);
    // 已收藏:图标本体不变(类 AdGuard 的勾由 badge 叠加)
    expect(iconPathsFor({ kind: "favorited", bookmark: added.value })).toEqual(
      outline
    );

    const unbookmarkable = iconPathsFor({ kind: "unbookmarkable" });
    expect(unbookmarkable["16"]).toBe("icons/disabled-16.png");
    expect(unbookmarkable["32"]).toBe("icons/disabled-32.png");
  });

  it("generate-icons 产物齐全:状态位图均在 public/icons(供 dist 构建复制)", () => {
    const publicIcons = join(__dirname, "../../public/icons");
    for (const name of [
      "outline-16.png",
      "outline-32.png",
      "disabled-16.png",
      "disabled-32.png",
    ]) {
      expect(
        existsSync(join(publicIcons, name)),
        `public/icons/${name} 缺失`
      ).toBe(true);
    }
  });
});

describe("工具栏图标状态判定(toolbarStateFor)", () => {
  it("chrome:// 等特殊页面与拿不到 URL 的标签页呈不可收藏态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(toolbarStateFor("chrome://settings", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor("edge://favorites", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor("about:blank", store)).toEqual({
      kind: "unbookmarkable",
    });
    expect(
      toolbarStateFor("chrome-extension://abc/newtab.html", store)
    ).toEqual({
      kind: "unbookmarkable",
    });
    expect(toolbarStateFor(undefined, store)).toEqual({
      kind: "unbookmarkable",
    });
  });

  it("可收藏但未收藏的页面呈未收藏态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(toolbarStateFor("https://Example.com/#top", store)).toEqual({
      kind: "unfavorited",
    });
  });

  it("已收藏页面呈已收藏态,并带回该收藏供点击取消", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "示例站",
    });
    if (!added.ok) throw new Error("fixture setup failed");

    const state = toolbarStateFor("HTTPS://Example.com#frag", store);

    // 判定走规范化 URL:大小写与 fragment 差异不影响命中
    expect(state).toEqual({ kind: "favorited", bookmark: added.value });
  });

  it("收藏被取消后回到未收藏态(同一 URL)", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({ url: "https://example.com" });
    if (!added.ok) throw new Error("fixture setup failed");

    await store.removeBookmark(added.value.id);

    expect(toolbarStateFor("https://example.com", store)).toEqual({
      kind: "unfavorited",
    });
  });
});
