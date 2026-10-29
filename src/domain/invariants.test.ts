import { describe, expect, it } from "vitest";
import { INBOX_GROUP_ID, SCHEMA_VERSION, createBookmarkStore } from "./store";
import { createMemoryStorage } from "../storage/memoryStorage";
import type { BookmarkState, StorageAdapter } from "./types";

/** 不变量(锁定):每个收藏必属且仅属一个现存分组;收集箱永远存在。 */
function expectInvariants(state: BookmarkState) {
  const groupIds = new Set(state.groups.map((g) => g.id));
  expect(groupIds.has(INBOX_GROUP_ID), "收集箱永远存在").toBe(true);
  const seen = new Set<string>();
  for (const bookmark of state.bookmarks) {
    expect(
      groupIds.has(bookmark.groupId),
      `收藏 ${bookmark.id} 必属一个现存分组`
    ).toBe(true);
    expect(seen.has(bookmark.id), `收藏 id 唯一:${bookmark.id}`).toBe(false);
    seen.add(bookmark.id);
  }
}

/** 分组 id 在组内唯一。 */
function expectUniqueGroupIds(state: BookmarkState) {
  expect(new Set(state.groups.map((g) => g.id)).size).toBe(state.groups.length);
}

describe("不变量(锁定)", () => {
  it("增删改与建组序列后,每个收藏必属且仅属一个现存分组,收集箱永远存在", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const work = await store.createGroup({ name: "工作", color: "#e99695" });
    if (!work.ok) throw new Error("fixture setup failed");

    const a = await store.addBookmark({
      url: "https://a.example.com",
      title: "A",
    });
    const b = await store.addBookmark({
      url: "https://b.example.com",
      groupId: work.value.id,
    });
    const c = await store.addBookmark({
      url: "https://c.example.com",
      groupId: work.value.id,
    });
    if (!a.ok || !b.ok || !c.ok) throw new Error("fixture setup failed");

    expectInvariants(store.getState());

    // 跨组移动 + 删除同组另一条
    await store.updateBookmark(a.value.id, { groupId: work.value.id });
    expectInvariants(store.getState());
    await store.removeBookmark(b.value.id);
    expectInvariants(store.getState());

    // 编辑 URL 与备注
    await store.updateBookmark(c.value.id, {
      url: "https://c2.example.com",
      note: "n",
    });
    expectInvariants(store.getState());

    // 删除到空再新增
    await store.removeBookmark(c.value.id);
    await store.addBookmark({ url: "https://d.example.com" });
    expectInvariants(store.getState());

    const final = store.getState();
    expect(final.groups.map((g) => g.id)).toEqual([
      INBOX_GROUP_ID,
      work.value.id,
    ]);
    expect(final.bookmarks).toHaveLength(2);
  });

  it("存储里丢失收集箱的损坏状态:建库时自动补回收集箱并落盘", async () => {
    const corrupted: BookmarkState = {
      schemaVersion: SCHEMA_VERSION,
      groups: [
        { id: "g-x", name: "杂项", color: "#e99695", order: 0, x: 0, y: 0 },
      ],
      bookmarks: [],
    };
    const storage: StorageAdapter = createMemoryStorage(corrupted);

    const store = await createBookmarkStore(storage);

    const repaired = store.getState();
    expect(repaired.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, "g-x"]);
    expectInvariants(repaired);
    // 修复也写回存储,新开的库实例看到同一结果
    const reopened = await createBookmarkStore(storage);
    expect(reopened.getState().groups.map((g) => g.id)).toEqual([
      INBOX_GROUP_ID,
      "g-x",
    ]);
  });
});

describe("不变量(锁定):删除分组回收与收集箱不可变", () => {
  it("删除含收藏的分组:收藏一条不丢,全部落到收集箱且顺序保持", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const work = await store.createGroup({ name: "工作", color: "#e99695" });
    const news = await store.createGroup({ name: "资讯", color: "#9fe295" });
    if (!work.ok || !news.ok) throw new Error("fixture setup failed");
    const urls = ["w1", "w2", "w3"];
    for (const u of urls) {
      const added = await store.addBookmark({
        url: `https://${u}.example.com`,
        groupId: work.value.id,
      });
      if (!added.ok) throw new Error("fixture setup failed");
    }
    const keptNews = await store.addBookmark({
      url: "https://news.example.com",
      groupId: news.value.id,
    });
    if (!keptNews.ok) throw new Error("fixture setup failed");
    const before = store.getState().bookmarks.map((b) => b.id);

    const deleted = await store.deleteGroup(work.value.id);

    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.value.recycledIds).toHaveLength(3);
    const state = store.getState();
    expectInvariants(state);
    expectUniqueGroupIds(state);
    // 一条不丢:原收藏 id 全部还在
    const after = state.bookmarks.map((b) => b.id);
    expect(after.slice().sort()).toEqual(before.slice().sort());
    // 回收的全部在收集箱,组内顺序保持 w1→w2→w3
    const recycled = state.bookmarks
      .filter((b) => b.groupId === INBOX_GROUP_ID)
      .sort((a, b) => a.order - b.order)
      .map((b) => b.url);
    expect(recycled).toEqual([
      "https://w1.example.com",
      "https://w2.example.com",
      "https://w3.example.com",
    ]);
    // 其他分组不受影响
    expect(state.bookmarks.some((b) => b.groupId === news.value.id)).toBe(true);
  });

  it("连环删除全部自定义分组后:只剩收集箱,所有收藏仍在收集箱里", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const groups = [];
    for (const name of ["一", "二", "三"]) {
      const created = await store.createGroup({ name, color: "#e99695" });
      if (!created.ok) throw new Error("fixture setup failed");
      groups.push(created.value.id);
      const added = await store.addBookmark({
        url: `https://${name}.example.com`,
        groupId: created.value.id,
      });
      if (!added.ok) throw new Error("fixture setup failed");
    }

    for (const id of groups) {
      const deleted = await store.deleteGroup(id);
      expect(deleted.ok).toBe(true);
      expectInvariants(store.getState());
    }

    const final = store.getState();
    expect(final.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID]);
    expect(final.bookmarks).toHaveLength(3);
    expect(final.bookmarks.every((b) => b.groupId === INBOX_GROUP_ID)).toBe(
      true
    );
  });

  it("收集箱不可删、不可改名换色:全部被拒且状态一字不变", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({ url: "https://example.com" });
    if (!added.ok) throw new Error("fixture setup failed");
    const before = store.getState();

    expect(await store.deleteGroup(INBOX_GROUP_ID)).toEqual({
      ok: false,
      error: "inbox-immutable",
    });
    expect(await store.renameGroup(INBOX_GROUP_ID, "改名")).toEqual({
      ok: false,
      error: "inbox-immutable",
    });
    expect(await store.recolorGroup(INBOX_GROUP_ID, "#000000")).toEqual({
      ok: false,
      error: "inbox-immutable",
    });
    expect(store.getState()).toEqual(before);
    expectInvariants(store.getState());
  });

  it("分组管理操作序列后不变量仍成立:排序、移动、删除交替", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const work = await store.createGroup({ name: "工作", color: "#e99695" });
    const news = await store.createGroup({ name: "资讯", color: "#9fe295" });
    if (!work.ok || !news.ok) throw new Error("fixture setup failed");
    const w = await store.addBookmark({
      url: "https://w.example.com",
      groupId: work.value.id,
    });
    const i = await store.addBookmark({ url: "https://i.example.com" });
    const n = await store.addBookmark({
      url: "https://n.example.com",
      groupId: news.value.id,
    });
    if (!w.ok || !i.ok || !n.ok) throw new Error("fixture setup failed");

    await store.reorderGroups([news.value.id, INBOX_GROUP_ID, work.value.id]);
    expectInvariants(store.getState());
    await store.moveBookmark(i.value.id, work.value.id, 0);
    expectInvariants(store.getState());
    await store.moveBookmark(n.value.id, undefined, 0);
    expectInvariants(store.getState());
    await store.deleteGroup(news.value.id);
    expectInvariants(store.getState());

    const final = store.getState();
    expectUniqueGroupIds(final);
    expect(final.groups.map((g) => g.id)).toEqual([
      INBOX_GROUP_ID,
      work.value.id,
    ]);
    expect(final.bookmarks).toHaveLength(3);
  });
});
