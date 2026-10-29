import { describe, expect, it } from "vitest";
import type { Bookmark, BookmarkState } from "./types";
import { INBOX_GROUP_COLOR, INBOX_GROUP_ID } from "./types";
import { filterState } from "./search";

function bookmark(
  partial: Partial<Bookmark> & Pick<Bookmark, "id" | "url">
): Bookmark {
  return {
    title: partial.url,
    note: "",
    groupId: INBOX_GROUP_ID,
    order: 0,
    ...partial,
  };
}

function stateOf(
  bookmarks: Bookmark[],
  groups = [
    {
      id: INBOX_GROUP_ID,
      name: "收集箱",
      color: INBOX_GROUP_COLOR,
      order: 0,
      x: 0,
      y: 0,
    },
  ]
): BookmarkState {
  return { schemaVersion: 1, groups, bookmarks };
}

describe("搜索过滤:查询词为空", () => {
  it("空查询原样返回全部分组与收藏(含空分组)", () => {
    const state = stateOf([bookmark({ id: "1", url: "https://example.com" })]);

    expect(filterState(state, "")).toEqual(state);
    expect(filterState(state, "   ")).toEqual(state);
  });
});

// 占位:后续测试逐一补齐
void stateOf;
describe("搜索过滤:匹配范围与大小写", () => {
  it("标题子串匹配不区分大小写,不匹配的收藏被过滤掉", () => {
    const state = stateOf([
      bookmark({ id: "1", url: "https://a.example.com", title: "GitHub Docs" }),
      bookmark({ id: "2", url: "https://b.example.com", title: "购物清单" }),
    ]);

    const result = filterState(state, "GITHUB");

    expect(result.bookmarks.map((b) => b.id)).toEqual(["1"]);
  });

  it("URL 匹配:查询词小写也能命中大写主机名的 URL", () => {
    const state = stateOf([
      bookmark({ id: "1", url: "https://GitHub.com/Docs", title: "文档" }),
      bookmark({ id: "2", url: "https://b.example.com", title: "无关" }),
    ]);

    const result = filterState(state, "github.com/docs");

    expect(result.bookmarks.map((b) => b.id)).toEqual(["1"]);
  });

  it("备注匹配:命中备注即保留该收藏", () => {
    const state = stateOf([
      bookmark({
        id: "1",
        url: "https://a.example.com",
        title: "工作",
        note: "周报模板 WIKI",
      }),
      bookmark({
        id: "2",
        url: "https://b.example.com",
        title: "工作",
        note: "",
      }),
    ]);

    const result = filterState(state, "wiki");

    expect(result.bookmarks.map((b) => b.id)).toEqual(["1"]);
  });

  it("查询词两端空白不参与匹配", () => {
    const state = stateOf([
      bookmark({ id: "1", url: "https://a.example.com", title: "文档" }),
    ]);

    expect(filterState(state, "  文档  ").bookmarks.map((b) => b.id)).toEqual([
      "1",
    ]);
  });
});

describe("搜索过滤:分组可见性与顺序", () => {
  const dev = {
    id: "dev",
    name: "开发",
    color: "#3b82f6",
    order: 1,
    x: 0,
    y: 0,
  };
  const shop = {
    id: "shop",
    name: "购物",
    color: "#22c55e",
    order: 2,
    x: 0,
    y: 0,
  };

  function multiGroupState(): BookmarkState {
    return {
      schemaVersion: 1,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: INBOX_GROUP_COLOR,
          order: 0,
          x: 0,
          y: 0,
        },
        dev,
        shop,
      ],
      bookmarks: [
        bookmark({
          id: "1",
          url: "https://a.example.com",
          title: "MDN 文档",
          groupId: "dev",
          order: 1,
        }),
        bookmark({
          id: "2",
          url: "https://b.example.com",
          title: "开发工具",
          groupId: "dev",
          order: 2,
        }),
        bookmark({
          id: "3",
          url: "https://c.example.com",
          title: "淘宝",
          groupId: "shop",
          order: 1,
        }),
        bookmark({
          id: "4",
          url: "https://d.example.com",
          title: "临时参考",
          groupId: INBOX_GROUP_ID,
          order: 3,
        }),
      ],
    };
  }

  it("无匹配的分组被隐藏,有匹配的分组保留且组内只留命中收藏", () => {
    const result = filterState(multiGroupState(), "文档");

    expect(result.groups.map((g) => g.id)).toEqual(["dev"]);
    expect(result.bookmarks.map((b) => b.id)).toEqual(["1"]);
  });

  it("收集箱参与同样的过滤,无命中同样隐藏", () => {
    const result = filterState(multiGroupState(), "淘宝");

    expect(result.groups.map((g) => g.id)).toEqual(["shop"]);
  });

  it("全部不匹配时分组与收藏均为空(初始页据此显示空状态)", () => {
    const result = filterState(multiGroupState(), "不存在的词");

    expect(result.groups).toEqual([]);
    expect(result.bookmarks).toEqual([]);
  });

  it("命中收藏与分组保持原有相对顺序(排序由 UI 按 order 负责)", () => {
    const state: BookmarkState = {
      schemaVersion: 1,
      // 数组顺序与 order 顺序刻意不同,验证过滤不重排
      groups: [shop, dev],
      bookmarks: [
        bookmark({
          id: "1",
          url: "https://a.example.com",
          title: "购物文档",
          groupId: "shop",
        }),
        bookmark({
          id: "2",
          url: "https://b.example.com",
          title: "开发文档",
          groupId: "dev",
        }),
      ],
    };

    const result = filterState(state, "文档");

    expect(result.groups.map((g) => g.id)).toEqual(["shop", "dev"]);
    expect(result.bookmarks.map((b) => b.id)).toEqual(["1", "2"]);
  });
});
