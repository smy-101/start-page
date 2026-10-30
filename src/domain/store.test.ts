import { describe, expect, it, vi } from "vitest";
import {
  INBOX_GROUP_ID,
  SCHEMA_VERSION,
  createBookmarkStore,
  isFreshInstallState,
  statesEqual,
} from "./store";
import { createMemoryStorage } from "../storage/memoryStorage";
import { CARD_W } from "./canvas";
import type { BookmarkState } from "./types";

describe("收藏库初始化", () => {
  it("全新存储:生成含 schemaVersion 与收集箱保留组的状态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    const state = store.getState();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID]);
    expect(state.groups[0]).toMatchObject({ name: "收集箱" });
    expect(state.bookmarks).toEqual([]);
  });

  it("状态经注入的存储适配器持久化:换一个库实例仍能读到同一状态", async () => {
    const storage = createMemoryStorage();
    const first = await createBookmarkStore(storage);
    const seeded = first.getState();

    const second = await createBookmarkStore(storage);
    expect(second.getState()).toEqual(seeded);
  });

  it("读取既有状态时不破坏原始数据(schemaVersion 与分组保留)", async () => {
    const existing: BookmarkState = {
      schemaVersion: SCHEMA_VERSION,
      canvasWidth: 1200,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "g-news", name: "资讯", color: "#e99695", order: 1, x: 0, y: 0 },
      ],
      bookmarks: [],
    };
    const store = await createBookmarkStore(createMemoryStorage(existing));

    expect(store.getState()).toEqual(existing);
  });
});

describe("isFreshInstallState:全新安装初始态判定(懒挂载折叠缺省用,工单 10b)", () => {
  it("仅收集箱、零收藏 → 初始态", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    expect(isFreshInstallState(store.getState())).toBe(true);
  });

  it("已有分组或有收藏 → 非初始态(老用户不命中折叠缺省)", () => {
    expect(
      isFreshInstallState({
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
          {
            id: "g-news",
            name: "资讯",
            color: "#e99695",
            order: 1,
            x: 0,
            y: 0,
          },
        ],
        bookmarks: [],
      })
    ).toBe(false);
    expect(
      isFreshInstallState({
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
        bookmarks: [
          {
            id: "b1",
            url: "https://a.example.com",
            title: "A",
            note: "",
            groupId: INBOX_GROUP_ID,
            order: 0,
          },
        ],
      })
    ).toBe(false);
  });
});

describe("添加收藏", () => {
  it("缺省进收集箱,URL 规范化保存,标题留空回退主机名", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    const result = await store.addBookmark({
      url: "HTTPS://Example.com/#top",
      title: "  ",
      note: " 示例 ",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      url: "https://example.com",
      title: "example.com",
      note: "示例",
      groupId: INBOX_GROUP_ID,
      order: 0,
    });
    expect(store.getState().bookmarks).toHaveLength(1);
  });

  it("无效 URL 被拒,不产生数据", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    const result = await store.addBookmark({ url: "不是网址", title: "x" });

    expect(result).toEqual({ ok: false, error: "invalid-url" });
    expect(store.getState().bookmarks).toEqual([]);
  });

  it("重复 URL(规范化后同值)被拒", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    await store.addBookmark({ url: "https://example.com" });

    const dup = await store.addBookmark({ url: "HTTPS://EXAMPLE.com/#frag" });

    expect(dup).toEqual({ ok: false, error: "duplicate-url" });
    expect(store.getState().bookmarks).toHaveLength(1);
  });

  it("指定不存在的分组被拒;指定现存分组则收藏进该组且组内 order 递增", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const missing = await store.addBookmark({
      url: "https://example.com",
      groupId: "nope",
    });
    expect(missing).toEqual({ ok: false, error: "group-not-found" });

    const group = await store.createGroup({ name: "工作", color: "#e99695" });
    expect(group.ok).toBe(true);
    if (!group.ok) return;

    const a = await store.addBookmark({
      url: "https://a.example.com",
      groupId: group.value.id,
    });
    const b = await store.addBookmark({
      url: "https://b.example.com",
      groupId: group.value.id,
    });
    expect(a.ok && a.value.order).toBe(0);
    expect(b.ok && b.value.order).toBe(1);
    expect(
      store.getState().bookmarks.every((bm) => bm.groupId === group.value.id)
    ).toBe(true);
  });

  it("建组:空名被拒;新组排在收集箱之后", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(await store.createGroup({ name: "  ", color: "#fff" })).toEqual({
      ok: false,
      error: "empty-group-name",
    });
    expect(await store.createGroup({ name: "工作", color: "  " })).toEqual({
      ok: false,
      error: "empty-group-color",
    });

    const created = await store.createGroup({
      name: " 工作 ",
      color: "#e99695",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.name).toBe("工作");
    expect(store.getState().groups.map((g) => [g.id, g.order])).toEqual([
      [INBOX_GROUP_ID, 0],
      [created.value.id, 1],
    ]);
  });
});

describe("编辑与删除收藏", () => {
  async function storeWithOne() {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "示例",
      note: "",
    });
    if (!added.ok) throw new Error("fixture setup failed");
    return { store, id: added.value.id };
  }

  it("编辑标题/备注:修剪空白,其余字段不变", async () => {
    const { store, id } = await storeWithOne();

    const result = await store.updateBookmark(id, {
      title: " 新标题 ",
      note: " 有备注 ",
    });

    expect(result.ok).toBe(true);
    expect(store.getState().bookmarks[0]).toMatchObject({
      id,
      title: "新标题",
      note: "有备注",
      url: "https://example.com",
    });
  });

  it("编辑 URL:规范化后更新;改成别的收藏已有的 URL 被拒;改回自身 URL 不算重复", async () => {
    const { store, id } = await storeWithOne();
    await store.addBookmark({ url: "https://other.com" });

    const moved = await store.updateBookmark(id, {
      url: "http://Example.com:80/a",
    });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.value.url).toBe("http://example.com/a");

    const dup = await store.updateBookmark(id, { url: "https://other.com/#x" });
    expect(dup).toEqual({ ok: false, error: "duplicate-url" });

    const self = await store.updateBookmark(id, {
      url: "http://example.com/a",
    });
    expect(self.ok).toBe(true);
  });

  it("编辑分组:移到现存分组;指定不存在的分组被拒", async () => {
    const { store, id } = await storeWithOne();
    const group = await store.createGroup({ name: "工作", color: "#e99695" });
    if (!group.ok) throw new Error("fixture setup failed");

    const moved = await store.updateBookmark(id, { groupId: group.value.id });
    expect(moved.ok).toBe(true);
    expect(store.getState().bookmarks[0].groupId).toBe(group.value.id);

    const bad = await store.updateBookmark(id, { groupId: "nope" });
    expect(bad).toEqual({ ok: false, error: "group-not-found" });
  });

  it("编辑不存在的收藏、非法 URL 均被拒", async () => {
    const { store } = await storeWithOne();

    expect(await store.updateBookmark("ghost", { title: "x" })).toEqual({
      ok: false,
      error: "bookmark-not-found",
    });
    expect(
      await store.updateBookmark((await store.getState()).bookmarks[0].id, {
        url: "垃圾",
      })
    ).toEqual({
      ok: false,
      error: "invalid-url",
    });
  });

  it("删除收藏:从状态与持久层移除;再删报不存在", async () => {
    const storage = createMemoryStorage();
    const store = await createBookmarkStore(storage);
    const { id } = await (async () => {
      const added = await store.addBookmark({ url: "https://example.com" });
      if (!added.ok) throw new Error("fixture setup failed");
      return { id: added.value.id };
    })();

    const removed = await store.removeBookmark(id);
    expect(removed).toEqual({ ok: true, value: id });
    expect(store.getState().bookmarks).toEqual([]);
    expect(await store.removeBookmark(id)).toEqual({
      ok: false,
      error: "bookmark-not-found",
    });

    const reopened = await createBookmarkStore(storage);
    expect(reopened.getState().bookmarks).toEqual([]);
  });
});

describe("按 URL 查收藏(工具栏图标状态判定)", () => {
  it("按规范化 URL 命中:大小写、尾斜杠与 fragment 不影响匹配,不限收集箱", async () => {
    const store = await createBookmarkStore(
      createMemoryStorage({
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
          {
            id: "g-news",
            name: "资讯",
            color: "#e99695",
            order: 1,
            x: 0,
            y: 0,
          },
        ],
        bookmarks: [
          {
            id: "b-1",
            url: "https://example.com",
            title: "示例站",
            note: "",
            groupId: "g-news",
            order: 0,
          },
        ],
      })
    );

    const found = store.findBookmarkByUrl("HTTPS://Example.com/#top");

    expect(found).toMatchObject({ id: "b-1", url: "https://example.com" });
  });

  it("未收藏的 URL 返回 null", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    await store.addBookmark({ url: "https://example.com" });

    expect(store.findBookmarkByUrl("https://other.example.org")).toBeNull();
  });

  it("不可收藏 URL(chrome:// 等)返回 null:拒绝只住在 URL 校验处,不重复实现", async () => {
    const store = await createBookmarkStore(createMemoryStorage());

    expect(store.findBookmarkByUrl("chrome://settings")).toBeNull();
    expect(store.findBookmarkByUrl("about:blank")).toBeNull();
    expect(
      store.findBookmarkByUrl("chrome-extension://abc/newtab.html")
    ).toBeNull();
  });

  it("随增删同步:添加后可查到,删除同一 URL 后回到 null", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    expect(store.findBookmarkByUrl("https://example.com")).toBeNull();

    await store.addBookmark({ url: "https://example.com", title: "示例站" });
    expect(store.findBookmarkByUrl("https://example.com")?.title).toBe(
      "示例站"
    );

    const found = store.findBookmarkByUrl("https://example.com");
    if (!found) throw new Error("fixture setup failed");
    await store.removeBookmark(found.id);
    expect(store.findBookmarkByUrl("https://example.com")).toBeNull();
  });
});

describe("编辑收藏的标题回退", () => {
  it("编辑把标题清空时,与添加一致:回退主机名而不是存空串", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    const added = await store.addBookmark({
      url: "https://example.com",
      title: "示例",
    });
    if (!added.ok) throw new Error("fixture setup failed");

    const cleared = await store.updateBookmark(added.value.id, {
      title: "   ",
    });

    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.value.title).toBe("example.com");
  });
});

describe("statesEqual:boot 回声抑制的状态相等契约", () => {
  const state = (over: Partial<BookmarkState> = {}): BookmarkState => ({
    schemaVersion: 1,
    groups: [
      { id: "inbox", name: "收集箱", color: "#3b82f6", order: 0, x: 0, y: 0 },
    ],
    bookmarks: [
      {
        id: "b1",
        url: "https://a.example.com",
        title: "A",
        note: "",
        groupId: "inbox",
        order: 0,
      },
    ],
    ...over,
  });

  it("同引用相等;逐字段一致的不同引用也相等", () => {
    const a = state();
    expect(statesEqual(a, a)).toBe(true);
    expect(statesEqual(a, state())).toBe(true);
  });

  it("任一字段不同即不等(分组名/收藏备注/schemaVersion)", () => {
    expect(
      statesEqual(
        state(),
        state({
          groups: [
            {
              id: "inbox",
              name: "收件",
              color: "#3b82f6",
              order: 0,
              x: 0,
              y: 0,
            },
          ],
        })
      )
    ).toBe(false);
    expect(
      statesEqual(
        state(),
        state({
          bookmarks: [
            {
              id: "b1",
              url: "https://a.example.com",
              title: "A",
              note: "x",
              groupId: "inbox",
              order: 0,
            },
          ],
        })
      )
    ).toBe(false);
    expect(statesEqual(state(), state({ schemaVersion: 2 }))).toBe(false);
  });

  it("数组长度与顺序参与相等(顺序即语义)", () => {
    const doubled = state({
      bookmarks: [
        {
          id: "b1",
          url: "https://a.example.com",
          title: "A",
          note: "",
          groupId: "inbox",
          order: 0,
        },
        {
          id: "b2",
          url: "https://b.example.com",
          title: "B",
          note: "",
          groupId: "inbox",
          order: 1,
        },
      ],
    });
    const [x, y] = doubled.bookmarks;
    expect(statesEqual(state(), doubled)).toBe(false);
    expect(statesEqual(doubled, { ...doubled, bookmarks: [y, x] })).toBe(false);
  });
});

describe("白板落点写回(board-whiteboard/02)", () => {
  /** 收集箱 + 两组已知坐标的库;适配器包 spy 观测落盘。 */
  async function board() {
    const base = createMemoryStorage({
      schemaVersion: SCHEMA_VERSION,
      canvasWidth: 1200,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "g-a", name: "A", color: "#e99695", order: 1, x: 405, y: 0 },
        { id: "g-b", name: "B", color: "#81a2be", order: 2, x: 0, y: 144 },
      ],
      bookmarks: [],
    });
    const save = vi.fn(base.save.bind(base));
    const adapter = Object.assign({}, base, { save });
    const store = await createBookmarkStore(adapter);
    return { store, adapter, save };
  }

  it("拖拽单卡写回:坐标更新,其余分组与 order 不动,落盘", async () => {
    const { store, adapter, save } = await board();

    const result = await store.setGroupPositions([{ id: "g-a", x: 64, y: 48 }]);

    expect(result.ok).toBe(true);
    expect(store.getState().groups.map((g) => [g.id, g.x, g.y])).toEqual([
      [INBOX_GROUP_ID, 0, 0],
      ["g-a", 64, 48],
      ["g-b", 0, 144],
    ]);
    // order 不参与落点,组序原样
    expect(store.getState().groups.map((g) => g.order)).toEqual([0, 1, 2]);
    expect((await adapter.load())?.groups[1]).toMatchObject({ x: 64, y: 48 });
    expect(save).toHaveBeenCalled();
  });

  it("整批写回:自动整理一次写多组", async () => {
    const { store } = await board();

    const result = await store.setGroupPositions([
      { id: "g-a", x: 0, y: 0 },
      { id: "g-b", x: 405, y: 0 },
      { id: INBOX_GROUP_ID, x: 810, y: 0 },
    ]);

    expect(result.ok).toBe(true);
    expect(store.getState().groups.map((g) => [g.x, g.y])).toEqual([
      [810, 0],
      [0, 0],
      [405, 0],
    ]);
  });

  it("坐标钳回:负值归零、x 不越右界、非有限值归原点", async () => {
    const { store } = await board();

    const result = await store.setGroupPositions([
      { id: "g-a", x: -20, y: -1 },
      { id: "g-b", x: Number.NaN, y: Number.POSITIVE_INFINITY },
    ]);

    expect(result.ok).toBe(true);
    const groups = store.getState().groups;
    expect(groups[1]).toMatchObject({ x: 0, y: 0 });
    expect(groups[2]).toMatchObject({ x: 0, y: 0 });
  });

  it("未知 id 整批拒绝,无部分写入", async () => {
    const { store, save } = await board();
    const before = store.getState();

    const result = await store.setGroupPositions([
      { id: "g-a", x: 16, y: 16 },
      { id: "nope", x: 0, y: 0 },
    ]);

    expect(result).toEqual({ ok: false, error: "group-not-found" });
    expect(store.getState()).toBe(before);
    expect(save).not.toHaveBeenCalled();
  });

  it("坐标无变化不落盘(吸附回原位的拖拽不写存储)", async () => {
    const { store, save } = await board();

    const result = await store.setGroupPositions([{ id: "g-a", x: 405, y: 0 }]);

    expect(result.ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it("空批无操作成功", async () => {
    const { store, save } = await board();

    const result = await store.setGroupPositions([]);

    expect(result.ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("画布宽写回(canvas-bounds-align,schema v4)", () => {
  /** 收集箱在 (0,0)、g-a 在 (810,0)(默认宽右界边)、g-b 在 (0,144) 的库。 */
  async function wide() {
    const base = createMemoryStorage({
      schemaVersion: SCHEMA_VERSION,
      canvasWidth: 1200,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "g-a", name: "A", color: "#e99695", order: 1, x: 810, y: 0 },
        { id: "g-b", name: "B", color: "#81a2be", order: 2, x: 0, y: 144 },
      ],
      bookmarks: [],
    });
    const save = vi.fn(base.save.bind(base));
    const adapter = Object.assign({}, base, { save });
    const store = await createBookmarkStore(adapter);
    return { store, adapter, save };
  }

  it("调宽:钳回界限后落盘,坐标不动", async () => {
    const { store, adapter, save } = await wide();

    const result = await store.setCanvasWidth(1760);

    expect(result).toEqual({ ok: true, value: 1760 });
    expect(store.getState().canvasWidth).toBe(1760);
    // 宽化不重钳坐标
    expect(store.getState().groups.map((g) => g.x)).toEqual([0, 810, 0]);
    expect((await adapter.load())?.canvasWidth).toBe(1760);
    expect(save).toHaveBeenCalled();
  });

  it("越界与非有限值钳回 [720, 2400] / 默认", async () => {
    const { store } = await wide();

    expect(await store.setCanvasWidth(100)).toEqual({ ok: true, value: 720 });
    expect(store.getState().canvasWidth).toBe(720);
    expect(await store.setCanvasWidth(9999)).toEqual({ ok: true, value: 2400 });
    expect(await store.setCanvasWidth(Number.NaN)).toEqual({
      ok: true,
      value: 1200,
    });
  });

  it("缩宽:越界分组重钳到新右界(默认宽缩 720 时 810 → 330.67…)", async () => {
    const { store } = await wide();

    await store.setCanvasWidth(720);

    expect(store.getState().canvasWidth).toBe(720);
    const groups = store.getState().groups;
    expect(groups[1].x).toBe(720 - CARD_W);
    expect(groups[2]).toMatchObject({ x: 0, y: 144 });
  });

  it("宽度与坐标均无变化不落盘", async () => {
    const { store, save } = await wide();

    await store.setCanvasWidth(1200);

    expect(save).not.toHaveBeenCalled();
  });

  it("后续拖拽落点钳回用新画布宽(宽化后右界放宽)", async () => {
    const { store } = await wide();

    await store.setCanvasWidth(2400);
    const result = await store.setGroupPositions([
      { id: "g-a", x: 2000, y: 0 },
    ]);

    expect(result.ok).toBe(true);
    expect(store.getState().groups[1].x).toBe(2000);
  });
});

describe("画布宽自动档(schema v5,canvas-bounds-align/04)", () => {
  /** 无 canvasWidth(自动档)的库:固定宽钳界不再默认 1200,按上限。 */
  async function auto() {
    return createBookmarkStore(
      createMemoryStorage({
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
          { id: "g-a", name: "A", color: "#e99695", order: 1, x: 0, y: 0 },
        ],
        bookmarks: [],
      })
    );
  }

  it("新建库不带 canvasWidth(自动档);落点按上限钳界,不钬回 1200 右界", async () => {
    const store = await createBookmarkStore(createMemoryStorage());
    expect(store.getState().canvasWidth).toBeUndefined();

    const result = await store.setGroupPositions([
      { id: INBOX_GROUP_ID, x: 2000, y: 0 },
    ]);
    expect(result.ok).toBe(true);
    expect(store.getState().groups[0].x).toBe(2000);
  });

  it("自动档钉宽:任意值(含恰为 1200)都算变化并落盘", async () => {
    const adapter = createMemoryStorage();
    const save = vi.fn(adapter.save.bind(adapter));
    const store = await createBookmarkStore(
      Object.assign({}, adapter, { save })
    );

    const result = await store.setCanvasWidth(1200);

    expect(result).toEqual({ ok: true, value: 1200 });
    expect(store.getState().canvasWidth).toBe(1200);
    expect(save).toHaveBeenCalled();
  });

  it("自动档钉窄后越界分组重钳(与固定宽同径)", async () => {
    const store = await auto();
    await store.setGroupPositions([{ id: "g-a", x: 2000, y: 0 }]);

    await store.setCanvasWidth(1760);

    expect(store.getState().canvasWidth).toBe(1760);
    expect(store.getState().groups[1].x).toBe(1760 - CARD_W);
  });
});
