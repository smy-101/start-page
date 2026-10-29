import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createBookmarkStore } from "../domain/store";
import { createMemoryStorage } from "../storage/memoryStorage";
import { iconPathsFor, toolbarStateFor } from "./toolbar";

describe("工具栏图标选择(iconPathsFor)", () => {
  it("三态各用一套位图:已收藏=大勾方块,未收藏=描边,不可收藏=浅灰 disabled", () => {
    const store = createBookmarkStore(createMemoryStorage());

    const unfavorited = iconPathsFor({ kind: "unfavorited" });
    expect(unfavorited["16"]).toBe("icons/outline-16.png");
    expect(unfavorited["32"]).toBe("icons/outline-32.png");

    const unbookmarkable = iconPathsFor({ kind: "unbookmarkable" });
    expect(unbookmarkable["16"]).toBe("icons/disabled-16.png");
    expect(unbookmarkable["32"]).toBe("icons/disabled-32.png");

    return store.then((s) => {
      const added = s.addBookmark({ url: "https://example.com", title: "x" });
      return added.then((r) => {
        if (!r.ok) throw new Error("fixture setup failed");
        const favorited = iconPathsFor({
          kind: "favorited",
          bookmark: r.value,
        });
        expect(favorited["16"]).toBe("icons/filled-16.png");
        expect(favorited["32"]).toBe("icons/filled-32.png");
      });
    });
  });

  it("generate-icons 产物齐全:三态位图均在 public/icons(供 dist 构建复制)", () => {
    const publicIcons = join(__dirname, "../../public/icons");
    for (const name of [
      "outline-16.png",
      "outline-32.png",
      "filled-16.png",
      "filled-32.png",
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
