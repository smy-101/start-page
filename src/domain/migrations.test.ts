import { beforeEach, describe, expect, it } from "vitest";
import { createBookmarkStore, statesEqual } from "../domain/store";
import { migrateState } from "../domain/migrations";
import { exportStateAsJson, importStateFromJson } from "../domain/importExport";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/types";
import type { BookmarkState, TodoCard } from "../domain/types";

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
      todos: [],
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

describe("schema v6 每行条数(group-width-tint)", () => {
  /** 自定义坐标的 v5 状态(合法 columns 与非法 columns 各一)。 */
  function v5State(): BookmarkState {
    return {
      schemaVersion: 5,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "g-a", name: "甲", color: "#e99695", order: 1, x: 405, y: 0 },
        { id: "g-b", name: "乙", color: "#81a2be", order: 2, x: 0, y: 144 },
      ],
      bookmarks: [],
    };
  }

  it("v5 → 当前版:升版落盘,坐标与既有字段逐字保留,无 columns 不回填", async () => {
    const adapter = createMemoryStorage(v5State());
    const store = await createBookmarkStore(adapter);

    const state = store.getState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.groups.every((g) => g.columns === undefined)).toBe(true);
    expect(state.groups.map((g) => [g.id, g.x, g.y])).toEqual([
      [INBOX_GROUP_ID, 0, 0],
      ["g-a", 405, 0],
      ["g-b", 0, 144],
    ]);
    expect((await adapter.load())?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("合法 columns 逐字保留;非法(越界/非整数/NaN)剥离为缺省", async () => {
    const state = {
      ...v5State(),
      groups: [
        ...v5State().groups.slice(0, 2),
        {
          ...v5State().groups[2],
          columns: 0,
        },
      ],
    };
    const adapter = createMemoryStorage(state);
    const store = await createBookmarkStore(adapter);
    expect(store.getState().groups[2].columns).toBeUndefined();

    const fractional = createMemoryStorage({
      ...v5State(),
      groups: v5State().groups.map((g, i) =>
        i === 1 ? { ...g, columns: 2.5 } : g
      ),
    });
    const store2 = await createBookmarkStore(fractional);
    expect(store2.getState().groups[1].columns).toBeUndefined();

    const valid = createMemoryStorage({
      ...v5State(),
      groups: v5State().groups.map((g, i) =>
        i === 1 ? { ...g, columns: 3 } : g
      ),
    });
    const store3 = await createBookmarkStore(valid);
    expect(store3.getState().groups[1].columns).toBe(3);
  });

  it("已是当前版且 columns 合法:幂等不落盘", async () => {
    const current: BookmarkState = {
      ...v5State(),
      schemaVersion: SCHEMA_VERSION,
      todos: [],
      groups: v5State().groups.map((g, i) =>
        i === 1 ? { ...g, columns: 2 } : g
      ),
    };
    const adapter = createMemoryStorage(current);

    await createBookmarkStore(adapter);

    expect(await adapter.load()).toBe(current);
  });
});

describe("schema v7 组宽档位(group-span-decouple)", () => {
  /** v6 状态:甲 columns 4、乙 columns 缺省。 */
  function v6State(): BookmarkState {
    return {
      schemaVersion: 6,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        {
          id: "g-a",
          name: "甲",
          color: "#e99695",
          order: 1,
          x: 405,
          y: 0,
          columns: 4,
        },
        { id: "g-b", name: "乙", color: "#81a2be", order: 2, x: 0, y: 144 },
      ],
      bookmarks: [],
    };
  }

  it("v6 → v7 零数据改写:升版落盘,groups 逐组引用不变,不物化 span", async () => {
    const seed = v6State();
    const adapter = createMemoryStorage(seed);
    const store = await createBookmarkStore(adapter);

    const state = store.getState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    // 零改写:组对象引用原样(缺省档位从 columns 推导,渲染逐字不变)
    expect(state.groups[0]).toBe(seed.groups[0]);
    expect(state.groups[1]).toBe(seed.groups[1]);
    expect(state.groups[2]).toBe(seed.groups[2]);
    expect((await adapter.load())?.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("幂等:已是 v7 的干净状态原引用返回", () => {
    const state = { ...v6State(), schemaVersion: SCHEMA_VERSION, todos: [] };
    expect(migrateState(state)).toBe(state);
  });

  it("防御:span 非法(越界/非整数)剥离为缺省(= 从 columns 推导)", () => {
    const state = {
      ...v6State(),
      schemaVersion: SCHEMA_VERSION,
      groups: [
        { ...v6State().groups[0], span: 0 },
        { ...v6State().groups[1], span: 2.5, columns: 4 },
      ],
    };
    const migrated = migrateState(state);
    expect(migrated.groups[0].span).toBeUndefined();
    // span 剥离后缺省从 columns 推导(生效档位 4,与抬档等价;剩一路径)
    expect(migrated.groups[1]).toMatchObject({ span: undefined, columns: 4 });
  });

  it("防御:columns > span 抬 span 到 columns(宽到装得下,不丢排版)", () => {
    const state = {
      ...v6State(),
      schemaVersion: SCHEMA_VERSION,
      groups: [{ ...v6State().groups[1], span: 2, columns: 4 }],
    };
    expect(migrateState(state).groups[0]).toMatchObject({
      span: 4,
      columns: 4,
    });
  });
});

describe("schema v7 防御补全(code-review):columns 非法值统一修复", () => {
  it("已是 v7 的状态含非法 columns(小数/NaN)也在加载链被剥离", () => {
    const base = {
      schemaVersion: SCHEMA_VERSION,
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
    } satisfies BookmarkState;
    const fractional = migrateState({
      ...base,
      groups: [{ ...base.groups[0], columns: 2.5 }],
    });
    expect(fractional.groups[0].columns).toBeUndefined();

    const nan = migrateState({
      ...base,
      groups: [{ ...base.groups[0], columns: Number.NaN }],
    });
    expect(nan.groups[0].columns).toBeUndefined();
  });
});

describe("迁移 v7→v8:待办卡补缺省(todo-card)", () => {
  /** 仅收集箱的 v7 基态(带画布坐标,无 todos 字段——v7 及更早均如此)。 */
  function v7State(): BookmarkState {
    return {
      schemaVersion: 7,
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
    } as BookmarkState;
  }

  it("v7 → v8:升版本并补缺省 todos 空数组;groups/bookmarks 引用原样", () => {
    const v7 = v7State();
    const migrated = migrateState(v7);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.todos).toEqual([]);
    expect(migrated.groups).toBe(v7.groups);
    expect(migrated.bookmarks).toBe(v7.bookmarks);
  });

  it("幂等:v8 干净状态原引用返回,已有 todos 逐字保留", () => {
    const v8 = {
      ...v7State(),
      schemaVersion: SCHEMA_VERSION,
      todos: [
        {
          id: "t1",
          title: "待办",
          order: 0,
          x: 0,
          y: 0,
          items: [{ id: "i1", text: "买咖啡豆", done: false, order: 0 }],
        },
      ],
    } as BookmarkState;
    expect(migrateState(v8)).toBe(v8);
  });

  it("todos 非数组(损坏数据)→ 加载链修复为空数组", () => {
    const broken = {
      ...v7State(),
      schemaVersion: SCHEMA_VERSION,
      todos: "不是数组",
    } as unknown as BookmarkState;
    expect(migrateState(broken).todos).toEqual([]);
  });
});

describe("迁移 v9→v10:待办卡自由宽(todo-card-size-color 调校)", () => {
  /** v9 基态:一张待办卡(可选覆盖项;span 为 v9 档位字段——v10 已退役)。 */
  function v9State(
    todos: Record<string, unknown>[] = [{}],
    version = 9
  ): BookmarkState {
    return {
      schemaVersion: version,
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
      todos: todos.map((t, i) => ({
        id: `t${i + 1}`,
        title: "待办",
        order: i,
        x: 0,
        y: 0,
        items: [],
        ...t,
      })) as TodoCard[],
    } as BookmarkState;
  }

  it("v8/v9 无 span 的卡:零数据改写——todos/groups/bookmarks 引用逐字保留", () => {
    for (const version of [8, 9]) {
      const before = v9State([], version);
      before.todos = [
        {
          id: "t1",
          title: "待办",
          order: 0,
          x: 0,
          y: 0,
          items: [],
          color: "#9fe295",
        } as TodoCard,
      ];
      const migrated = migrateState(before);
      expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
      expect(migrated.todos).toBe(before.todos);
      expect(migrated.groups).toBe(before.groups);
      expect(migrated.bookmarks).toBe(before.bookmarks);
    }
  });

  it("v9 → v10:span 按旧档位数学换算为 px 存 width、剥离 span", () => {
    const v9 = v9State([{ span: 3 }, { span: 1 }]);
    const migrated = migrateState(v9);
    // W9(3) = floor(389.33 + 2×95) = 579;档 1 = floor(CARD_W) = 389
    expect(migrated.todos!.map((t) => (t as { width?: number }).width)).toEqual(
      [579, 389]
    );
    expect(
      migrated.todos!.every((t) => (t as { span?: number }).span === undefined)
    ).toBe(true);
  });

  it("v9 非法档位(非整数/越 1..5)归档 1 换算(389)", () => {
    const v9 = v9State([{ span: 0 }, { span: 7 }, { span: 2.5 }]);
    const migrated = migrateState(v9);
    expect(migrated.todos!.map((t) => (t as { width?: number }).width)).toEqual(
      [389, 389, 389]
    );
  });

  it("幂等:v10 干净状态(合法 width/color)原引用返回", () => {
    const v10 = {
      ...v9State([], SCHEMA_VERSION),
      todos: [
        {
          id: "t1",
          title: "待办",
          order: 0,
          x: 0,
          y: 0,
          items: [],
          width: 579,
          color: "#9fe295",
        },
      ],
    } as BookmarkState;
    expect(migrateState(v10)).toBe(v10);
  });

  it("修复:非法 width(NaN/越界/非整数)钳回;残留 span 剥离;非 string color 剥离", () => {
    const broken = {
      ...v9State([], SCHEMA_VERSION),
      todos: [
        {
          id: "t1",
          title: "a",
          order: 0,
          x: 0,
          y: 0,
          items: [],
          width: Number.NaN,
          color: 42,
        },
        {
          id: "t2",
          title: "b",
          order: 1,
          x: 0,
          y: 0,
          items: [],
          width: 100,
          color: "#f0c674",
        },
        { id: "t3", title: "c", order: 2, x: 0, y: 0, items: [], width: 5000 },
        { id: "t4", title: "d", order: 3, x: 0, y: 0, items: [], width: 484.6 },
        { id: "t5", title: "e", order: 4, x: 0, y: 0, items: [], span: 3 },
      ],
    } as unknown as BookmarkState;
    const migrated = migrateState(broken);
    // 非法 width 钳回(NaN→389、100→240、5000→768、484.6→484);
    // t5 是 v10 状态里的残留 span(不走 v9 换算):剥离,宽保持缺省
    expect(migrated.todos!.map((t) => (t as { width?: number }).width)).toEqual(
      [389, 240, 768, 484, undefined]
    );
    expect(migrated.todos!.map((t) => (t as { color?: string }).color)).toEqual(
      [undefined, "#f0c674", undefined, undefined, undefined]
    );
    expect(
      migrated.todos!.every((t) => (t as { span?: number }).span === undefined)
    ).toBe(true);
  });
});

describe("迁移 v10→v11:待办卡定长高(todo-height-archive)", () => {
  /** v10 基态:一张待办卡(可选覆盖项)。 */
  function v10State(todos: Record<string, unknown>[]): BookmarkState {
    return {
      schemaVersion: 10,
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
      todos: todos.map((t, i) => ({
        id: `t${i + 1}`,
        title: "待办",
        order: i,
        x: 0,
        y: 0,
        items: [],
        ...t,
      })) as TodoCard[],
    } as BookmarkState;
  }

  it("v10 → v11:零数据改写——todos/groups/bookmarks 引用逐字保留", () => {
    const before = v10State([{ width: 484, color: "#9fe295" }, {}]);
    const migrated = migrateState(before);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.todos).toBe(before.todos);
    expect(migrated.groups).toBe(before.groups);
    expect(migrated.bookmarks).toBe(before.bookmarks);
  });

  it("幂等:v11 干净状态(合法 height)原引用返回", () => {
    const v11 = {
      ...v10State([]),
      schemaVersion: SCHEMA_VERSION,
      todos: [
        {
          id: "t1",
          title: "待办",
          order: 0,
          x: 0,
          y: 0,
          items: [],
          height: 320,
        } as TodoCard,
      ],
    } as BookmarkState;
    expect(migrateState(v11)).toBe(v11);
  });

  it("修复:非法 height 有限越界/非整数钳回,非有限/非数剥离为自适应", () => {
    const broken = {
      ...v10State([]),
      schemaVersion: SCHEMA_VERSION,
      todos: [
        { id: "t1", title: "a", order: 0, x: 0, y: 0, items: [], height: 9999 },
        { id: "t2", title: "b", order: 1, x: 0, y: 0, items: [], height: 50 },
        {
          id: "t3",
          title: "c",
          order: 2,
          x: 0,
          y: 0,
          items: [],
          height: 320.6,
        },
        {
          id: "t4",
          title: "d",
          order: 3,
          x: 0,
          y: 0,
          items: [],
          height: Number.NaN,
        },
        {
          id: "t5",
          title: "e",
          order: 4,
          x: 0,
          y: 0,
          items: [],
          height: "tall",
        },
      ],
    } as unknown as BookmarkState;
    const migrated = migrateState(broken);
    // 有限越界/非整数钳回(9999→720、50→176、320.6→320);
    // 非有限/非数剥离为 undefined(高的缺省是「不定长」,垃圾不物化定长)
    expect(
      migrated.todos!.map((t) => (t as { height?: number }).height)
    ).toEqual([720, 176, 320, undefined, undefined]);
  });
});
