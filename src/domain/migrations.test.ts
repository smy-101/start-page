import { beforeEach, describe, expect, it } from "vitest";
import { createBookmarkStore, statesEqual } from "../domain/store";
import { exportStateAsJson, importStateFromJson } from "../domain/importExport";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/types";
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

/** 仅收集箱的 v3 基态(收集箱 (0,0))。 */
function v3InboxOnly(): BookmarkState {
  return {
    schemaVersion: 3,
    groups: [
      {
        id: INBOX_GROUP_ID,
        name: "收集箱",
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
    ],
    bookmarks: [],
  };
}

/** v2 形状(schemaVersion 2,分组无画布坐标)。 */
function v2State(): BookmarkState {
  return {
    schemaVersion: 2,
    groups: [
      { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      { id: "g-work", name: "工作", color: "#e99695", order: 1 },
      { id: "g-dev", name: "开发", color: "#81a2be", order: 2 },
      { id: "g-news", name: "资讯", color: "#f0c674", order: 3 },
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
  it("加载 v1 状态即升级到当前 schema 并落盘,数据原样保留", async () => {
    const adapter = createMemoryStorage(v1State());
    const store = await createBookmarkStore(adapter);

    expect(store.getState().schemaVersion).toBe(SCHEMA_VERSION);
    // v1 跨多版迁移:分组同样落画布坐标(收集箱 (0,0)、工作 (405,0));
    // 画布宽缺省 = 自动档(schema v5,不补数值)
    expect(store.getState().groups.map((g) => [g.x, g.y])).toEqual([
      [0, 0],
      [405, 0],
    ]);
    expect(store.getState().canvasWidth).toBeUndefined();
    const saved = await adapter.load();
    expect(saved?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved?.bookmarks[0].title).toBe("示例");
    expect(saved?.bookmarks[0].icon).toBeUndefined();
  });

  it("addBookmark 可携带 icon;updateBookmark 回填 icon", async () => {
    const store = await createBookmarkStore(
      createMemoryStorage({
        schemaVersion: 3,
        groups: [
          {
            id: INBOX_GROUP_ID,
            name: "收集箱",
            color: "#3b82f6",
            order: 0,
            x: 0,
            y: 0,
          },
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

describe("schema v3 迁移(board-whiteboard/01)", () => {
  it("加载 v2 状态:升级当前版,分组按 order 三列均匀铺开,收集箱同迁,落盘", async () => {
    const adapter = createMemoryStorage(v2State());
    const store = await createBookmarkStore(adapter);

    const state = store.getState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    // order 保序(含收集箱同迁);坐标 = 列序 ×(卡宽+间距)向下取整,行距 72(原型引导堆叠步长)
    expect(state.groups.map((g) => [g.id, g.x, g.y])).toEqual([
      [INBOX_GROUP_ID, 0, 0],
      ["g-work", 405, 0],
      ["g-dev", 810, 0],
      ["g-news", 0, 72],
    ]);
    // 收藏逐字不动
    expect(state.bookmarks).toEqual(v2State().bookmarks);
    // 迁移结果落盘
    const saved = await adapter.load();
    expect(saved?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved?.groups.map((g) => g.x)).toEqual([0, 405, 810, 0]);
  });

  it("迁移幂等:已是当前版本且无需修复的状态再建库不重排、不落盘", async () => {
    // 先迁移一次拿到 v3 状态
    const first = await createBookmarkStore(createMemoryStorage(v2State()));
    const migrated = first.getState();
    const adapter = createMemoryStorage(migrated);

    await createBookmarkStore(adapter);

    // 未发生任何写入:适配器里仍是原引用,坐标一字不差
    expect(await adapter.load()).toBe(migrated);
    expect((await adapter.load())?.groups.map((g) => [g.x, g.y])).toEqual([
      [0, 0],
      [405, 0],
      [810, 0],
      [0, 72],
    ]);
  });
  it("createGroup 默认落画布底部左侧追加位", async () => {
    const store = await createBookmarkStore(createMemoryStorage(v2State()));
    // 迁移后底边 = 第四组 y=72 + 代理卡高 48 → 新组落 (0,120)
    const created = await store.createGroup({ name: "新组", color: "#111111" });
    expect(created.ok && [created.value.x, created.value.y]).toEqual([0, 120]);

    // 再建一个接在后追加(代理卡高推底)
    const second = await store.createGroup({
      name: "又一组",
      color: "#222222",
    });
    expect(second.ok && [second.value.x, second.value.y]).toEqual([0, 168]);
  });

  it("statesEqual 纳入画布坐标比较", async () => {
    const store = await createBookmarkStore(createMemoryStorage(v2State()));
    const before = store.getState();
    const moved: BookmarkState = {
      ...before,
      groups: before.groups.map((g) =>
        g.id === "g-work" ? { ...g, x: g.x + 16 } : g
      ),
    };
    expect(statesEqual(before, before)).toBe(true);
    expect(statesEqual(before, moved)).toBe(false);
  });
});

describe("JSON 备份兼容(board-refresh/05)", () => {
  it("v1 备份仍可导入(merge 与 replace)", async () => {
    const base = {
      schemaVersion: 3,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
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
      schemaVersion: 3,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
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

describe("迁移坐标与钳回右界的一致性(board-whiteboard/01 spec 评审)", () => {
  it("迁移产物导出→replace 再导入:坐标逐字稳定(不触发钳回)", async () => {
    const store = await createBookmarkStore(createMemoryStorage(v2State()));
    const migrated = store.getState();

    const adapter = createMemoryStorage(v3InboxOnly());
    const result = await importStateFromJson(
      adapter,
      exportStateAsJson(migrated),
      "replace"
    );
    expect(result.ok).toBe(true);
    expect((await adapter.load())!.groups.map((g) => [g.x, g.y])).toEqual(
      migrated.groups.map((g) => [g.x, g.y])
    );
  });
});

describe("schema v5 画布宽自动档(canvas-bounds-align/04)", () => {
  /** 自定义坐标的 v3 状态:升级绝不能重铺坐标。 */
  function v3CustomCoords(): BookmarkState {
    return {
      schemaVersion: 3,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 810,
          y: 144,
        },
        { id: "g-a", name: "甲", color: "#e99695", order: 1, x: 405, y: 72 },
      ],
      bookmarks: [],
    };
  }

  it("v3 → 当前版:坐标逐字保留,画布宽缺省 = 自动档,升版落盘", async () => {
    const adapter = createMemoryStorage(v3CustomCoords());
    const store = await createBookmarkStore(adapter);

    const state = store.getState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.canvasWidth).toBeUndefined();
    expect(state.groups.map((g) => [g.id, g.x, g.y])).toEqual([
      [INBOX_GROUP_ID, 810, 144],
      ["g-a", 405, 72],
    ]);
    const saved = await adapter.load();
    expect(saved?.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved?.canvasWidth).toBeUndefined();
  });

  it("v4 回填默认 1200 → 剥离回自动档;调过的宽(1760)保留为固定宽", async () => {
    const backfill = createMemoryStorage({
      ...v3CustomCoords(),
      schemaVersion: 4,
      canvasWidth: 1200,
    });
    const store = await createBookmarkStore(backfill);
    expect(store.getState().schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.getState().canvasWidth).toBeUndefined();
    expect((await backfill.load())?.canvasWidth).toBeUndefined();

    const pinned = await createBookmarkStore(
      createMemoryStorage({
        ...v3CustomCoords(),
        schemaVersion: 4,
        canvasWidth: 1760,
      })
    );
    expect(pinned.getState().canvasWidth).toBe(1760);
  });

  it("当前版状态再建库:幂等不落盘(缺宽 = 自动档,非需修复项)", async () => {
    const current: BookmarkState = {
      ...v3CustomCoords(),
      schemaVersion: SCHEMA_VERSION,
    };
    const adapter = createMemoryStorage(current);

    await createBookmarkStore(adapter);

    expect(await adapter.load()).toBe(current);
  });

  it("宽度修复:非法宽(NaN/越界)钳回默认/界限并落盘", async () => {
    const adapter = createMemoryStorage({
      ...v3CustomCoords(),
      schemaVersion: 4,
      canvasWidth: Number.NaN,
    });
    const store = await createBookmarkStore(adapter);
    expect(store.getState().canvasWidth).toBe(1200);
    expect((await adapter.load())?.canvasWidth).toBe(1200);

    const wide = createMemoryStorage({
      ...v3CustomCoords(),
      schemaVersion: 4,
      canvasWidth: 9999,
    });
    const store2 = await createBookmarkStore(wide);
    expect(store2.getState().canvasWidth).toBe(2400);
  });

  it("statesEqual 纳入画布宽(逐字比较;缺省自动档 ≠ 钉住的固定宽)", () => {
    const base: BookmarkState = {
      ...v3CustomCoords(),
      schemaVersion: SCHEMA_VERSION,
      canvasWidth: 1200,
    };
    expect(statesEqual(base, base)).toBe(true);
    expect(statesEqual(base, { ...base, canvasWidth: 1200 })).toBe(true);
    expect(statesEqual(base, { ...base, canvasWidth: undefined })).toBe(false);
    expect(statesEqual(base, { ...base, canvasWidth: 1760 })).toBe(false);
  });
});
