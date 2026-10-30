import { describe, expect, it } from "vitest";
import type { BookmarkState } from "./types";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "./types";
import {
  exportStateAsHtml,
  exportStateAsJson,
  importBookmarksFromHtml,
  importStateFromJson,
  parseBookmarksHtml,
} from "./importExport";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createBookmarkStore } from "./store";
import chromeExportHtml from "../../tests/fixtures/chrome-bookmarks-export.html?raw";

/** 与实现无耦合的字面量状态:导出/导入回环的独立真值来源。 */
export function literalState(): BookmarkState {
  return {
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
      { id: "g-work", name: "工作", color: "#f97316", order: 1, x: 0, y: 0 },
      { id: "g-dev", name: "开发", color: "#22c55e", order: 2, x: 0, y: 0 },
    ],
    bookmarks: [
      {
        id: "b-1",
        url: "https://example.com",
        title: "示例站",
        note: "第一条备注",
        groupId: INBOX_GROUP_ID,
        order: 0,
      },
      {
        id: "b-2",
        url: "https://git.example.com/org/repo?tab=readme",
        title: "代码仓库",
        note: "",
        groupId: "g-work",
        order: 0,
      },
      {
        id: "b-3",
        url: "http://localhost:5173",
        title: "本地开发服",
        note: "仅本机",
        groupId: "g-dev",
        order: 0,
      },
    ],
  };
}

describe("导出 JSON:完整状态逐字备份", () => {
  it("导出内容 JSON.parse 后与原状态深度相等(含 schemaVersion/颜色/顺序/备注)", () => {
    const state = literalState();

    const raw = exportStateAsJson(state);

    expect(JSON.parse(raw)).toEqual(state);
    expect(JSON.parse(raw).schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("导出 HTML:Netscape 书签格式", () => {
  it("首行为 Netscape DOCTYPE 声明,分组映射为一层文件夹,书签在对应文件夹内", () => {
    const raw = exportStateAsHtml(literalState());

    expect(raw.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1>")).toBe(true);
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const folders = [...doc.querySelectorAll("h3")].map((h3) => h3.textContent);
    expect(folders).toEqual(["收集箱", "工作", "开发"]);
    const links = [...doc.querySelectorAll("a")].map((a) => ({
      href: a.getAttribute("href"),
      title: a.textContent,
    }));
    expect(links).toEqual([
      { href: "https://example.com", title: "示例站" },
      {
        href: "https://git.example.com/org/repo?tab=readme",
        title: "代码仓库",
      },
      { href: "http://localhost:5173", title: "本地开发服" },
    ]);
  });

  it("书签嵌套在所属分组文件夹之下(书签不在根层)", () => {
    const raw = exportStateAsHtml(literalState());

    const doc = new DOMParser().parseFromString(raw, "text/html");
    const rootDl = doc.querySelector("dl");
    // 根层只有分组文件夹的 DT,没有直接的 A
    for (const dt of [...rootDl!.children]) {
      if (dt.tagName === "DT")
        expect(dt.querySelector(":scope > a")).toBeNull();
    }
    // 每个分组文件夹的 DL 内书签数与状态一致
    const devFolder = [...doc.querySelectorAll("h3")].find(
      (h3) => h3.textContent === "开发"
    )!;
    const devDl = devFolder.closest("dt")!.querySelector(":scope > dl")!;
    expect(devDl.querySelectorAll("a")).toHaveLength(1);
  });

  it('备注写成书签后随的 <DD>,特殊字符(&、<、")被转义', () => {
    const state = literalState();
    state.bookmarks[0].note = 'Tom & Jerry <"贵宾">';
    state.groups[1].name = "研发&运维";

    const raw = exportStateAsHtml(state);

    expect(raw).toContain('<DD>Tom &amp; Jerry &lt;"贵宾"&gt;');
    expect(raw).toContain("<H3>研发&amp;运维</H3>");
    const doc = new DOMParser().parseFromString(raw, "text/html");
    const dt = [...doc.querySelectorAll("dt")].find((el) =>
      el
        .querySelector(":scope > a")
        ?.getAttribute("href")
        ?.startsWith("https://example.com")
    )!;
    expect(dt.nextElementSibling!.tagName).toBe("DD");
    expect(dt.nextElementSibling!.textContent!.trim()).toBe(
      'Tom & Jerry <"贵宾">'
    );
  });
});

describe("解析 HTML:DOMParser 纯函数(真实 Chrome 导出样本)", () => {
  it("文件夹→分组(含嵌套文件夹各成一组),书签→对应组,顺序保持文档顺序", () => {
    const result = parseBookmarksHtml(chromeExportHtml);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups.map((g) => g.name)).toEqual([
      "书签栏",
      "开发工具",
      "阅读清单",
    ]);
    expect(result.value.groups[0]!.bookmarks.map((b) => b.url)).toEqual([
      "https://www.google.com/",
      "https://github.com/",
      "javascript:void(0)",
    ]);
    expect(result.value.groups[1]!.bookmarks.map((b) => b.title)).toEqual([
      "Chrome 扩展文档",
      "Vitest",
    ]);
  });

  it("书签后的 <DD> 读为备注;根级书签(不在任何文件夹)归入收集箱", () => {
    const result = parseBookmarksHtml(chromeExportHtml);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const github = result.value.groups[0]!.bookmarks[1]!;
    expect(github.note).toBe("代码托管");
    expect(github.title).toBe("GitHub");
    expect(result.value.inbox.map((b) => b.url)).toEqual([
      "https://news.example.org/daily",
    ]);
    expect(result.value.inbox[0]!.note).toBe("");
  });

  it("同名文件夹并入同一分组;空标题文件夹回退「未命名分组」", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>待读</H3>
    <DL><p>
        <DT><A HREF="https://a.example.com/">A</A>
    </DL><p>
    <DT><H3></H3>
    <DL><p>
        <DT><A HREF="https://b.example.com/">B</A>
    </DL><p>
    <DT><H3>待读</H3>
    <DL><p>
        <DT><A HREF="https://c.example.com/">C</A>
    </DL><p>
</DL><p>
`;

    const result = parseBookmarksHtml(html);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups.map((g) => g.name)).toEqual([
      "待读",
      "未命名分组",
    ]);
    expect(result.value.groups[0]!.bookmarks.map((b) => b.url)).toEqual([
      "https://a.example.com/",
      "https://c.example.com/",
    ]);
  });

  it("解析不到任何文件夹与书签时返回 invalid-import", () => {
    expect(
      parseBookmarksHtml("<html><body><p>不是书签文件</p></body></html>")
    ).toEqual({
      ok: false,
      error: "invalid-import",
    });
    expect(parseBookmarksHtml('{"schemaVersion":1}')).toEqual({
      ok: false,
      error: "invalid-import",
    });
  });
});

describe("导入 HTML:合并进现有状态(URL 判重跳过)", () => {
  it("空库导入 Chrome 样本:根级书签进收集箱、文件夹建分组,报告新增 6 跳过 1,结果已保存", async () => {
    const adapter = createMemoryStorage();

    const result = await importBookmarksFromHtml(adapter, chromeExportHtml);

    expect(result).toEqual({ ok: true, value: { added: 6, skipped: 1 } });
    const state = await adapter.load();
    expect(state!.groups.map((g) => g.name)).toEqual([
      "收集箱",
      "书签栏",
      "开发工具",
      "阅读清单",
    ]);
    expect(state!.bookmarks).toHaveLength(6);
    // 无效 URL(小书签 javascript:)被跳过
    expect(state!.bookmarks.some((b) => b.url.startsWith("javascript:"))).toBe(
      false
    );
    // URL 经规范化去根路径尾斜杠
    const google = state!.bookmarks.find((b) => b.title === "Google")!;
    expect(google.url).toBe("https://www.google.com");
    const bar = state!.groups.find((g) => g.name === "书签栏")!;
    expect(google.groupId).toBe(bar.id);
    // 备注/DD 保留;根级书签进收集箱;新建分组都有颜色
    const github = state!.bookmarks.find((b) => b.title === "GitHub")!;
    expect(github.note).toBe("代码托管");
    const rootLevel = state!.bookmarks.find(
      (b) => b.url === "https://news.example.org/daily"
    )!;
    expect(rootLevel.groupId).toBe(INBOX_GROUP_ID);
    for (const group of state!.groups) {
      if (group.id !== INBOX_GROUP_ID)
        expect(group.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("与手动添加共用同一判重路径:库中已有同 URL 时导入跳过该条", async () => {
    const adapter = createMemoryStorage();
    const store = await createBookmarkStore(adapter);
    await store.addBookmark({
      url: "https://www.google.com/",
      title: "手动加的 Google",
    });

    const result = await importBookmarksFromHtml(adapter, chromeExportHtml);

    expect(result).toEqual({ ok: true, value: { added: 5, skipped: 2 } });
    const state = await adapter.load();
    // 手动加的那条保留,导入的同 URL 条被跳过
    expect(
      state!.bookmarks.filter((b) => b.url === "https://www.google.com")
    ).toHaveLength(1);
    expect(
      state!.bookmarks.find((b) => b.url === "https://www.google.com")!.title
    ).toBe("手动加的 Google");
  });

  it("重复导入同一文件:全部判重,新增 0 跳过 7", async () => {
    const adapter = createMemoryStorage();
    await importBookmarksFromHtml(adapter, chromeExportHtml);

    const result = await importBookmarksFromHtml(adapter, chromeExportHtml);

    expect(result).toEqual({ ok: true, value: { added: 0, skipped: 7 } });
    expect((await adapter.load())!.bookmarks).toHaveLength(6);
  });

  it("空标题书签回退主机名(与手动添加同规则)", async () => {
    const adapter = createMemoryStorage();
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://no-title.example.com/"></A>
</DL><p>
`;

    await importBookmarksFromHtml(adapter, html);

    const state = await adapter.load();
    expect(state!.bookmarks[0]!.title).toBe("no-title.example.com");
  });
});

describe("导入 JSON:解析校验", () => {
  it("非 JSON、缺字段、schemaVersion 不符均拒为 invalid-import,现有状态不受影响", async () => {
    const adapter = createMemoryStorage();
    const store = await createBookmarkStore(adapter);
    await store.addBookmark({ url: "https://keep.example.com", title: "保留" });
    const before = await adapter.load();

    for (const bad of [
      "不是 JSON",
      "{}",
      JSON.stringify({ schemaVersion: 99, groups: [], bookmarks: [] }),
      JSON.stringify({
        schemaVersion: 1,
        groups: [{ id: "g", name: "x" }],
        bookmarks: [],
      }),
      JSON.stringify({
        schemaVersion: 1,
        groups: [],
        bookmarks: [{ id: "b", url: "x" }],
      }),
    ]) {
      expect(await importStateFromJson(adapter, bad, "merge")).toEqual({
        ok: false,
        error: "invalid-import",
      });
    }
    expect(await adapter.load()).toEqual(before);
  });
});

describe("导入 JSON:合并模式", () => {
  it("同名分组并入现有组(不新建),新 URL 追加到组末,重复 URL 跳过", async () => {
    const adapter = createMemoryStorage();
    const store = await createBookmarkStore(adapter);
    const work = await store.createGroup({ name: "工作", color: "#f97316" });
    if (!work.ok) throw new Error("预置分组失败");
    await store.addBookmark({
      url: "https://a.example.com",
      title: "已有 A",
      groupId: work.value.id,
    });

    const incoming: BookmarkState = {
      schemaVersion: 1,
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
          id: "other-install-work",
          name: "工作",
          color: "#111111",
          order: 1,
          x: 0,
          y: 0,
        },
      ],
      bookmarks: [
        {
          id: "x-1",
          url: "https://a.example.com",
          title: "重复的 A",
          note: "",
          groupId: "other-install-work",
          order: 0,
        },
        {
          id: "x-2",
          url: "https://b.example.com",
          title: "新的 B",
          note: "带备注",
          groupId: "other-install-work",
          order: 1,
        },
      ],
    };

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(incoming),
      "merge"
    );

    expect(result).toEqual({ ok: true, value: { added: 1, skipped: 1 } });
    const state = await adapter.load();
    // 未新建分组;新收藏落在现有「工作」组,顺序追加在后;现有分组颜色不被覆盖
    expect(state!.groups).toHaveLength(2);
    const b = state!.bookmarks.find(
      (bm) => bm.url === "https://b.example.com"
    )!;
    expect(b.groupId).toBe(work.value.id);
    expect(b.order).toBe(1);
    expect(b.note).toBe("带备注");
    expect(state!.groups.find((g) => g.name === "工作")!.color).toBe("#f97316");
    expect(
      state!.bookmarks.find((bm) => bm.url === "https://a.example.com")!.title
    ).toBe("已有 A");
  });

  it("备份中的新分组按备份颜色新建,其收集箱收藏并入现有收集箱", async () => {
    const adapter = createMemoryStorage();
    await createBookmarkStore(adapter);

    const incoming: BookmarkState = {
      schemaVersion: 1,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "src-1", name: "设计", color: "#ec4899", order: 1, x: 0, y: 0 },
      ],
      bookmarks: [
        {
          id: "y-1",
          url: "https://figma.example.com",
          title: "设计工具",
          note: "",
          groupId: "src-1",
          order: 0,
        },
        {
          id: "y-2",
          url: "https://quick.example.com",
          title: "速记",
          note: "",
          groupId: INBOX_GROUP_ID,
          order: 0,
        },
      ],
    };

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(incoming),
      "merge"
    );

    expect(result).toEqual({ ok: true, value: { added: 2, skipped: 0 } });
    const state = await adapter.load();
    const design = state!.groups.find((g) => g.name === "设计")!;
    expect(design.color).toBe("#ec4899");
    expect(
      state!.bookmarks.find((b) => b.url === "https://quick.example.com")!
        .groupId
    ).toBe(INBOX_GROUP_ID);
  });
});

describe("导入 JSON:替换全部模式", () => {
  it("清空后恢复备份:旧分组/收藏消失,恢复状态与备份深度相等", async () => {
    const adapter = createMemoryStorage();
    const store = await createBookmarkStore(adapter);
    const old = await store.createGroup({ name: "将被清掉", color: "#000000" });
    if (!old.ok) throw new Error("预置分组失败");
    await store.addBookmark({
      url: "https://old.example.com",
      groupId: old.value.id,
    });

    const backup = literalState();
    const result = await importStateFromJson(
      adapter,
      JSON.stringify(backup),
      "replace"
    );

    expect(result).toEqual({ ok: true, value: { added: 3, skipped: 0 } });
    expect(await adapter.load()).toEqual(backup);
    expect(
      (await adapter.load())!.groups.some((g) => g.name === "将被清掉")
    ).toBe(false);
  });

  it("导出→清空→导入回环后数据无损(领域层锁定)", async () => {
    const original = literalState();
    const adapterA = createMemoryStorage(original);
    const exported = await adapterA.load();
    if (!exported) throw new Error("预置状态失败");
    const raw = exportStateAsJson(exported);

    // 清空:换新空库模拟全新安装/抹除
    const adapterB = createMemoryStorage(null);
    await createBookmarkStore(adapterB); // 空库初始化出仅含收集箱的状态

    const result = await importStateFromJson(adapterB, raw, "replace");

    expect(result).toEqual({ ok: true, value: { added: 3, skipped: 0 } });
    expect(await adapterB.load()).toEqual(original);
  });

  it("恢复时修复损坏备份:孤儿收藏收回收集箱,缺失收集箱补回,备份内重复 URL 只留一条", async () => {
    const adapter = createMemoryStorage();
    const corrupt: BookmarkState = {
      schemaVersion: 1,
      groups: [
        {
          id: "g-only",
          name: "仅有的组",
          color: "#123456",
          order: 0,
          x: 0,
          y: 0,
        },
      ],
      bookmarks: [
        {
          id: "c-1",
          url: "https://ok.example.com",
          title: "正常",
          note: "",
          groupId: "g-only",
          order: 0,
        },
        {
          id: "c-2",
          url: "https://orphan.example.com",
          title: "孤儿",
          note: "",
          groupId: "gone",
          order: 0,
        },
        {
          id: "c-3",
          url: "https://dup.example.com",
          title: "第一条",
          note: "",
          groupId: "g-only",
          order: 1,
        },
        {
          id: "c-4",
          url: "https://dup.example.com/",
          title: "重复条",
          note: "",
          groupId: "g-only",
          order: 2,
        },
      ],
    };

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(corrupt),
      "replace"
    );

    expect(result).toEqual({ ok: true, value: { added: 3, skipped: 1 } });
    const state = await adapter.load();
    expect(state!.groups.map((g) => g.id)).toEqual([INBOX_GROUP_ID, "g-only"]);
    expect(state!.bookmarks.find((b) => b.title === "孤儿")!.groupId).toBe(
      INBOX_GROUP_ID
    );
    expect(
      state!.bookmarks.filter((b) => b.url === "https://dup.example.com")
    ).toHaveLength(1);
    expect(
      state!.bookmarks.find((b) => b.url === "https://dup.example.com")!.title
    ).toBe("第一条");
  });
});

describe("HTML 生成→解析回环", () => {
  it("导出的 HTML 再解析:分组顺序/名称与书签 URL/标题/备注一一还原", () => {
    const state = literalState();
    state.groups[0]!.name = "收集箱";

    const parsed = parseBookmarksHtml(exportStateAsHtml(state));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // 导出按 order 排序:收集箱→工作→开发;根级无散落书签,收集箱组为空
    expect(parsed.value.inbox).toEqual([]);
    expect(parsed.value.groups.map((g) => g.name)).toEqual([
      "收集箱",
      "工作",
      "开发",
    ]);
    const flat = parsed.value.groups.flatMap((g) =>
      g.bookmarks.map((b) => ({ group: g.name, ...b }))
    );
    expect(flat).toEqual([
      {
        group: "收集箱",
        url: "https://example.com",
        title: "示例站",
        note: "第一条备注",
      },
      {
        group: "工作",
        url: "https://git.example.com/org/repo?tab=readme",
        title: "代码仓库",
        note: "",
      },
      {
        group: "开发",
        url: "http://localhost:5173",
        title: "本地开发服",
        note: "仅本机",
      },
    ]);
  });
});

describe("导入后的不变量(与工单 02 锁定的一致)", () => {
  it("HTML 与 JSON 合并导入后:每条收藏必属且仅属一个现存分组,收集箱存在", async () => {
    const adapter = createMemoryStorage();
    const store = await createBookmarkStore(adapter);
    const other = await store.createGroup({ name: "已有组", color: "#654321" });
    if (!other.ok) throw new Error("预置分组失败");
    await store.addBookmark({
      url: "https://pre.example.com",
      groupId: other.value.id,
    });

    await importBookmarksFromHtml(adapter, chromeExportHtml);
    const incoming: BookmarkState = {
      schemaVersion: 1,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: 0,
          y: 0,
        },
        { id: "bk-1", name: "备份组", color: "#111111", order: 1, x: 0, y: 0 },
      ],
      bookmarks: [
        {
          id: "k-1",
          url: "https://json.example.com",
          title: "J",
          note: "",
          groupId: "bk-1",
          order: 0,
        },
      ],
    };
    await importStateFromJson(adapter, JSON.stringify(incoming), "merge");

    const state = (await adapter.load())!;
    expect(state.groups.some((g) => g.id === INBOX_GROUP_ID)).toBe(true);
    const groupIds = new Set(state.groups.map((g) => g.id));
    for (const bookmark of state.bookmarks) {
      expect(groupIds.has(bookmark.groupId)).toBe(true);
    }
    // 每条收藏恰好属于一个分组:分组 id 互不重叠即可由上式与唯一 groupId 保证
    expect(new Set(state.bookmarks.map((b) => b.id)).size).toBe(
      state.bookmarks.length
    );
  });
});

describe("V3 画布坐标兼容(board-whiteboard/01)", () => {
  /** v2 备份形状:分组无画布坐标。 */
  const v2Backup = JSON.stringify({
    schemaVersion: 2,
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
  });

  function v3Base(): BookmarkState {
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

  it("v2 备份 replace 导入走同一迁移:分组装箱出坐标、版本升当前版", async () => {
    const adapter = createMemoryStorage(v3Base());

    const result = await importStateFromJson(adapter, v2Backup, "replace");
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.canvasWidth).toBeUndefined(); // v3 及更早备份 → 自动档(schema v5)
    expect(state.groups.map((g) => [g.id, g.x, g.y])).toEqual([
      [INBOX_GROUP_ID, 0, 0],
      ["g-work", 405, 0],
    ]);
  });

  it("v3 备份 replace 往返:自定义坐标逐字保留", async () => {
    const state = v3Base();
    state.groups.push(
      {
        id: "g-moved",
        name: "搬过的组",
        color: "#e99695",
        order: 1,
        x: 123,
        y: 456,
      },
      {
        id: "g-edge",
        name: "边缘组",
        color: "#22c55e",
        order: 2,
        x: 805.5,
        y: 0,
      }
    );
    const adapter = createMemoryStorage(v3Base());

    const result = await importStateFromJson(
      adapter,
      exportStateAsJson(state),
      "replace"
    );
    expect(result.ok).toBe(true);
    const restored = (await adapter.load())!;
    expect(restored.groups.map((g) => [g.x, g.y])).toEqual([
      [0, 0],
      [123, 456],
      [805.5, 0],
    ]);
  });

  it("v3 校验:负坐标压回 0,越界 x 钳回画布右界", async () => {
    const backup = {
      schemaVersion: 3,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: -50,
          y: -3,
        },
        {
          id: "g-far",
          name: "出界组",
          color: "#e99695",
          order: 1,
          x: 9999,
          y: 7,
        },
      ],
      bookmarks: [],
    };
    const adapter = createMemoryStorage(v3Base());

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(backup),
      "replace"
    );
    expect(result.ok).toBe(true);
    const state = (await adapter.load())!;
    // 右界 = 上限 2400 − 卡宽(缺省自动档按上限钳,与 store 同口径)
    expect(state.groups[0].x).toBe(0);
    expect(state.groups[0].y).toBe(0);
    expect(state.groups[1].x).toBeCloseTo(2400 - 1168 / 3, 10);
    expect(state.groups[1].y).toBe(7);
  });

  it("v3 备份缺坐标或坐标非数字拒收", async () => {
    const missing = JSON.stringify({
      schemaVersion: 3,
      groups: [
        { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
      ],
      bookmarks: [],
    });
    expect(
      (await importStateFromJson(createMemoryStorage(null), missing, "replace"))
        .ok
    ).toBe(false);

    const badType = JSON.stringify({
      schemaVersion: 3,
      groups: [
        {
          id: INBOX_GROUP_ID,
          name: "收集箱",
          color: "#3b82f6",
          order: 0,
          x: "12",
          y: 0,
        },
      ],
      bookmarks: [],
    });
    expect(
      (await importStateFromJson(createMemoryStorage(null), badType, "replace"))
        .ok
    ).toBe(false);
  });

  it("merge 建新组:落画布底部追加位,连续新组按堆叠步长排开", async () => {
    const adapter = createMemoryStorage(v3Base());
    const backup = {
      schemaVersion: 3,
      groups: [
        {
          id: "x1",
          name: "新组甲",
          color: "#e99695",
          order: 0,
          x: 999,
          y: 999,
        },
        { id: "x2", name: "新组乙", color: "#22c55e", order: 1, x: 5, y: 5 },
      ],
      bookmarks: [],
    };

    const result = await importStateFromJson(
      adapter,
      JSON.stringify(backup),
      "merge"
    );
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    // 本地收集箱 (0,0) 不动;新组按追加位落下(merge 不携带备份坐标)
    expect(state.groups.map((g) => [g.name, g.x, g.y])).toEqual([
      ["收集箱", 0, 0],
      ["新组甲", 0, 48],
      ["新组乙", 0, 120],
    ]);
  });

  it("HTML 导入建新组同样落画布底部追加位", async () => {
    const adapter = createMemoryStorage(v3Base());
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
        <DT><H3>工具</H3><DL><p>
            <DT><A HREF="https://tool.example.com">工具站</A>
        </DL><p>
    </DL><p>`;

    const result = await importBookmarksFromHtml(adapter, html);
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    const created = state.groups.find((g) => g.name === "工具");
    expect([created?.x, created?.y]).toEqual([0, 48]);
  });
});

describe("restoreFrom 补缺收集箱的落位(board-whiteboard/01 spec 评审)", () => {
  it("备份缺失收集箱:补回时落画布底部追加位,不与首组重叠", async () => {
    const backup = JSON.stringify({
      schemaVersion: 3,
      groups: [
        { id: "g-a", name: "甲组", color: "#e99695", order: 0, x: 0, y: 0 },
      ],
      bookmarks: [],
    });
    const adapter = createMemoryStorage(null);

    const result = await importStateFromJson(adapter, backup, "replace");
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    const inbox = state.groups.find((g) => g.id === INBOX_GROUP_ID)!;
    expect([inbox.x, inbox.y]).toEqual([0, 48]);
  });
});

describe("V4 画布宽兼容(canvas-bounds-align)", () => {
  /** 宽 1760 的 v4 备份:一张卡在 1200 默认右界外(1380)。 */
  const v4WideBackup = JSON.stringify({
    schemaVersion: 4,
    canvasWidth: 1760,
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
        id: "g-wide",
        name: "宽外组",
        color: "#e99695",
        order: 1,
        x: 1300,
        y: 0,
      },
    ],
    bookmarks: [],
  });

  it("v4 备份 replace:宽度随备份恢复,右界外坐标不被 1200 默认宽钳毁", async () => {
    const adapter = createMemoryStorage(null);

    const result = await importStateFromJson(adapter, v4WideBackup, "replace");
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    expect(state.canvasWidth).toBe(1760);
    expect(state.groups[1].x).toBe(1300);
  });

  it("v4 备份 merge:保留本地画布宽,不采纳备份宽", async () => {
    const adapter = createMemoryStorage({
      schemaVersion: 4,
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
      ],
      bookmarks: [],
    });

    const result = await importStateFromJson(adapter, v4WideBackup, "merge");
    expect(result.ok).toBe(true);
    expect((await adapter.load())!.canvasWidth).toBe(1200);
  });

  it("备份宽非法不拒收:replace 时钳回界限;非数字拒收", async () => {
    const badWidth = JSON.stringify({
      schemaVersion: 4,
      canvasWidth: 9999,
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
    const adapter = createMemoryStorage(null);

    const result = await importStateFromJson(adapter, badWidth, "replace");
    expect(result.ok).toBe(true);
    const state = (await adapter.load())!;
    expect(state.canvasWidth).toBe(2400);
    // 出界坐标同时按 2400 重钳
    expect(state.groups.every((g) => g.x <= 2400 - 1168 / 3 + 1e-9)).toBe(true);

    const notNumber = JSON.stringify({
      schemaVersion: 4,
      canvasWidth: "1760",
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
    expect(
      (
        await importStateFromJson(
          createMemoryStorage(null),
          notNumber,
          "replace"
        )
      ).ok
    ).toBe(false);
  });

  it("v3 备份 replace 升当前版:画布缺省 = 自动档(v3 库→当前版直接可用)", async () => {
    const adapter = createMemoryStorage(null);
    const v3Backup = JSON.stringify({
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

    const result = await importStateFromJson(adapter, v3Backup, "replace");
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.canvasWidth).toBeUndefined();
  });

  it("v4 回填宽 1200 经 replace 剥离回自动档(v5 迁移与加载同口径)", async () => {
    const adapter = createMemoryStorage(null);
    const v4Backfill = JSON.stringify({
      schemaVersion: 4,
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
      ],
      bookmarks: [],
    });

    const result = await importStateFromJson(adapter, v4Backfill, "replace");
    expect(result.ok).toBe(true);

    const state = (await adapter.load())!;
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.canvasWidth).toBeUndefined();
  });

  it("v5 自动档备份 replace 往返:缺省保留,不补数值", async () => {
    const auto: BookmarkState = {
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
    };
    const adapter = createMemoryStorage(null);

    const result = await importStateFromJson(
      adapter,
      exportStateAsJson(auto),
      "replace"
    );
    expect(result.ok).toBe(true);
    expect((await adapter.load())!.canvasWidth).toBeUndefined();
  });
});

describe("V7 组宽档位兼容(group-span-decouple)", () => {
  /** v7 备份组:超档组(span 6, columns 4)+ 清单式组(span 4, columns 1)。 */
  function v7Groups() {
    return [
      {
        id: INBOX_GROUP_ID,
        name: "收集箱",
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
      {
        id: "g-over",
        name: "超档",
        color: "#e99695",
        order: 1,
        x: 100,
        y: 0,
        span: 6,
        columns: 4,
      },
      {
        id: "g-list",
        name: "清单",
        color: "#81a2be",
        order: 2,
        x: 0,
        y: 200,
        span: 4,
        columns: 1,
      },
    ];
  }
  const backup = (groups: unknown[] = v7Groups(), canvasWidth = 720) =>
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      canvasWidth,
      groups,
      bookmarks: [],
    });

  it("span 校验:可缺省;给了必须是数字,字符串拒收", async () => {
    const pristine = createMemoryStorage(null);
    const noSpan = v7Groups().map((g) => ({ ...g, span: undefined }));
    expect(
      (await importStateFromJson(pristine, backup(noSpan), "replace")).ok
    ).toBe(true);

    const bad = createMemoryStorage(null);
    const strSpan = v7Groups().map((g, i) =>
      i === 1 ? { ...g, span: "4" } : g
    );
    expect((await importStateFromJson(bad, backup(strSpan), "replace")).ok).toBe(
      false
    );
  });

  it("replace 恢复:超档组降档连带降每行条数,x 按新宽钳;清单式 columns 不动", async () => {
    const adapter = createMemoryStorage(null);

    expect((await importStateFromJson(adapter, backup(), "replace")).ok).toBe(
      true
    );

    const state = (await adapter.load())!;
    // 720 下最大档 3(W(3)=602 ≤ 720 < W(4)=792);x=100 ≤ 118 合法不动
    expect(state.groups[1]).toMatchObject({ span: 3, columns: 3, x: 100 });
    // 清单式组同样降档:columns 1 ≤ 3 不动
    expect(state.groups[2]).toMatchObject({ span: 3, columns: 1 });
  });

  it("小数 columns 备份(v7 同版绕过迁移):恢复时按缺省装满处理,不落小数", async () => {
    const adapter = createMemoryStorage(null);
    const fractional = v7Groups().map((g, i) =>
      i === 1 ? { ...g, columns: 2.5 } : g
    );

    expect(
      (await importStateFromJson(adapter, backup(fractional, 1200), "replace")).ok
    ).toBe(true);

    const state = (await adapter.load())!;
    // 非整数 = 非法:恢复为缺省(装满随档位),不把 2.5 写进存储
    expect(state.groups[1].columns).toBeUndefined();
    expect(state.groups[1].span).toBe(6);
  });

  it("宽画布原样往返:档位与每行条数逐字保留;缺省组不物化 span", async () => {
    const adapter = createMemoryStorage(null);

    await importStateFromJson(adapter, backup(v7Groups(), 1200), "replace");

    const state = (await adapter.load())!;
    expect(state.groups[1]).toMatchObject({ span: 6, columns: 4 });
    expect(state.groups[2]).toMatchObject({ span: 4, columns: 1 });

    // v6 形状(无 span)导入:不物化 span,渲染口径从 columns 推导
    const v6 = createMemoryStorage(null);
    const noSpan = v7Groups().map((g) => ({ ...g, span: undefined }));
    await importStateFromJson(v6, backup(noSpan, 1200), "replace");
    const v6State = (await v6.load())!;
    expect(v6State.groups[1].span).toBeUndefined();
    expect(v6State.groups[1].columns).toBe(4);
  });
});
