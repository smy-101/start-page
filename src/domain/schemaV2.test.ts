import { beforeEach, describe, expect, it } from "vitest";
import { createBookmarkStore, statesEqual } from "../domain/store";
import { importStateFromJson } from "../domain/importExport";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID } from "../domain/types";
import type { BookmarkState } from "../domain/types";

/** v1 形状(schemaVersion 1,收藏无 icon 字段)。 */
function v1State(): BookmarkState {
  return {
    schemaVersion: 1,
    groups: [
      { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      { id: "g-work", name: "工作", color: "#e99695", order: 1 },
    ],
    bookmarks: [
      {
        id: "b1",
        url: "https://example.com",
        title: "示例",
        note: "",
        groupId: "g-work",
        order: 0,
      },
    ],
  } as BookmarkState;
}

beforeEach(() => {
  localStorage.clear();
});

describe("schema v2 迁移(board-refresh/05)", () => {
  it("加载 v1 状态即升级到 v2 并落盘,数据原样保留", async () => {
    const adapter = createMemoryStorage(v1State());
    const store = await createBookmarkStore(adapter);

    expect(store.getState().schemaVersion).toBe(2);
    const saved = await adapter.load();
    expect(saved?.schemaVersion).toBe(2);
    expect(saved?.bookmarks[0].title).toBe("示例");
    expect(saved?.bookmarks[0].icon).toBeUndefined();
  });

  it("addBookmark 可携带 icon;updateBookmark 回填 icon", async () => {
    const store = await createBookmarkStore(
      createMemoryStorage({
        schemaVersion: 2,
        groups: [
          { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
        ],
        bookmarks: [],
      })
    );

    const added = await store.addBookmark({
      url: "https://a.com",
      icon: "data:image/png;base64,AAA",
    });
    expect(added.ok && added.value.icon).toBe("data:image/png;base64,AAA");

    const plain = await store.addBookmark({ url: "https://b.com" });
    if (!plain.ok) throw new Error("unexpected");
    const patched = await store.updateBookmark(plain.value.id, {
      icon: "data:image/x-icon;base64,BBB",
    });
    expect(patched.ok && patched.value.icon).toBe(
      "data:image/x-icon;base64,BBB"
    );

    // 空 patch.icon 不清掉已有图标
    const untouched = await store.updateBookmark(plain.value.id, { note: "x" });
    expect(untouched.ok && untouched.value.icon).toBe(
      "data:image/x-icon;base64,BBB"
    );
  });

  it("statesEqual 纳入 icon 比较", async () => {
    const adapter = createMemoryStorage(v1State());
    const store = await createBookmarkStore(adapter);
    const before = store.getState();
    const b = before.bookmarks[0];
    await store.updateBookmark(b.id, { icon: "data:image/png;base64,ZZZ" });
    expect(statesEqual(before, store.getState())).toBe(false);
  });
});

describe("JSON 备份兼容(board-refresh/05)", () => {
  it("v1 备份仍可导入(merge 与 replace)", async () => {
    const base = {
      schemaVersion: 2,
      groups: [
        { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      ],
      bookmarks: [],
    };
    const v1Backup = JSON.stringify(v1State());

    const merged = await importStateFromJson(
      createMemoryStorage(base),
      v1Backup,
      "merge"
    );
    expect(merged.ok).toBe(true);

    const replaced = await importStateFromJson(
      createMemoryStorage(base),
      v1Backup,
      "replace"
    );
    expect(replaced.ok).toBe(true);
  });

  it("v2 备份 replace 逐字保留 icon", async () => {
    const state = v1State();
    state.schemaVersion = 2;
    state.bookmarks[0].icon = "data:image/png;base64,KEEP";
    const adapter = createMemoryStorage({
      schemaVersion: 2,
      groups: [
        { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      ],
      bookmarks: [],
    });

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(state),
      "replace"
    );
    expect(result.ok).toBe(true);
    expect((await adapter.load())?.bookmarks[0].icon).toBe(
      "data:image/png;base64,KEEP"
    );
  });

  it("未来版本与非法 icon 的备份拒收", async () => {
    const adapter = createMemoryStorage(null);
    const future = JSON.stringify({ ...v1State(), schemaVersion: 99 });
    expect((await importStateFromJson(adapter, future, "replace")).ok).toBe(
      false
    );

    const badIcon = {
      ...v1State(),
      schemaVersion: 2,
      bookmarks: [{ ...v1State().bookmarks[0], icon: 42 }],
    };
    expect(
      (await importStateFromJson(adapter, JSON.stringify(badIcon), "replace"))
        .ok
    ).toBe(false);
  });
});
