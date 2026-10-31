import type {
  Bookmark,
  BookmarkState,
  Group,
  Result,
  StorageAdapter,
  TodoCard,
} from "./types";
import {
  createInboxGroup,
  INBOX_GROUP_COLOR,
  INBOX_GROUP_ID,
  INBOX_GROUP_NAME,
  MIN_IMPORT_SCHEMA_VERSION,
  nextOrder,
  SCHEMA_VERSION,
} from "./types";
import { normalizeUrl } from "./url";
import {
  CARD_W,
  MAX_CANVAS_W,
  appendPositions,
  canvasWidthOf,
  clampCanvasWidth,
  clampTodoHeight,
  clampTodoWidth,
  clampToCanvas,
  groupSpanOf,
  groupWidthOf,
  maxSpanForCanvas,
} from "./canvas";
import { legacySpanWidth, migrateState } from "./migrations";

/**
 * 导入导出:双格式(JSON 完整备份 / Netscape HTML 通用迁移)双向。
 * 全部为纯函数;导入经注入的存储适配器读写,与手动添加共用 normalizeUrl 判重。
 */

export type ParsedBookmark = { url: string; title: string; note: string };
export type ParsedGroup = { name: string; bookmarks: ParsedBookmark[] };
/** HTML 解析结果:文件夹→分组,根级书签(不属于任何文件夹)→收集箱。 */
export type ParsedBookmarks = {
  inbox: ParsedBookmark[];
  groups: ParsedGroup[];
};

/** 导出 JSON:完整状态逐字序列化,可作为无损备份。 */
export function exportStateAsJson(state: BookmarkState): string {
  return JSON.stringify(state, null, 2);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

/**
 * 导出 HTML:Netscape 书签文件(DOCTYPE NETSCAPE-Bookmark-file-1),
 * 分组按 order 映射为一层文件夹,供 Chrome 等浏览器原生书签管理器导入。
 * 颜色与 id 无法携带(HTML 通用迁移格式,有损;无损用 JSON)。
 */
export function exportStateAsHtml(state: BookmarkState): string {
  const groups = [...state.groups].sort((a, b) => a.order - b.order);
  const lines: string[] = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file.",
    "     It will be read and overwritten.",
    "     DO NOT EDIT! -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>初始页收藏</TITLE>",
    "<H1>初始页收藏</H1>",
    "<DL><p>",
  ];
  for (const group of groups) {
    lines.push(`    <DT><H3>${escapeHtml(group.name)}</H3>`);
    lines.push("    <DL><p>");
    const bookmarks = state.bookmarks
      .filter((bookmark) => bookmark.groupId === group.id)
      .sort((a, b) => a.order - b.order);
    for (const bookmark of bookmarks) {
      lines.push(
        `        <DT><A HREF="${escapeAttr(bookmark.url)}">${escapeHtml(bookmark.title)}</A>`
      );
      if (bookmark.note) lines.push(`<DD>${escapeHtml(bookmark.note)}`);
    }
    lines.push("    </DL><p>");
  }
  lines.push("</DL><p>");
  return `${lines.join("\n")}\n`;
}

function directChild(el: Element, tag: string): Element | null {
  for (const child of el.children) {
    if (child.tagName === tag) return child;
  }
  return null;
}

/** 书签的备注在 Netscape 格式中是紧随其 DT 的同级 <DD>。 */
function noteAfter(dt: Element): string {
  const next = dt.nextElementSibling;
  return next && next.tagName === "DD" ? (next.textContent ?? "").trim() : "";
}

/**
 * 解析 Netscape 书签 HTML(基于 DOMParser,可在测试环境运行):
 * 文件夹(含嵌套)→同名分组,同名合并;书签→所在文件夹的分组,根级书签→收集箱。
 * 解析不到任何文件夹与书签时视为无效文件。
 */
export function parseBookmarksHtml(html: string): Result<ParsedBookmarks> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const parsed: ParsedBookmarks = { inbox: [], groups: [] };
  const byName = new Map<string, ParsedGroup>();

  function groupFor(name: string): ParsedGroup {
    const existing = byName.get(name);
    if (existing) return existing;
    const created: ParsedGroup = { name, bookmarks: [] };
    byName.set(name, created);
    parsed.groups.push(created);
    return created;
  }

  function walk(dl: Element, into: ParsedGroup | null) {
    for (const dt of dl.children) {
      if (dt.tagName !== "DT") continue;
      const h3 = directChild(dt, "H3");
      if (h3) {
        const group = groupFor(h3.textContent?.trim() || "未命名分组");
        const childDl = directChild(dt, "DL");
        if (childDl) walk(childDl, group);
        continue;
      }
      const a = directChild(dt, "A");
      if (a) {
        const bookmark: ParsedBookmark = {
          url: a.getAttribute("href") ?? "",
          title: (a.textContent ?? "").trim(),
          note: noteAfter(dt),
        };
        (into ? into.bookmarks : parsed.inbox).push(bookmark);
      }
    }
  }

  // 顶层 DL = 不嵌套在其他 DL 内的 DL(忽略散落的 <p> 等杂项)
  for (const dl of doc.querySelectorAll("dl")) {
    if (!dl.parentElement?.closest("dl")) walk(dl, null);
  }

  if (parsed.groups.length === 0 && parsed.inbox.length === 0) {
    return { ok: false, error: "invalid-import" };
  }
  return { ok: true, value: parsed };
}

export type ImportMode = "merge" | "replace";

/** 导入结果统计:UI 据此提示「新增 N 条、跳过 M 条」。 */
export interface ImportReport {
  added: number;
  skipped: number;
}

/** HTML 不携带颜色,导入分组统一用此默认色。 */
export const IMPORTED_GROUP_COLOR = "#8b5cf6";

/** 待并入的分组(名→目标组),颜色仅在建新组时生效。 */
interface IncomingGroup {
  name: string;
  color: string;
  bookmarks: ParsedBookmark[];
}

function emptyState(): BookmarkState {
  // 画布宽缺省 = 自动档(schema v5):不写数值,渲染时撑满可用宽
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [createInboxGroup(0)],
    bookmarks: [],
    todos: [],
  };
}

/**
 * 合并并入:分组按名归入(同名并组、新名建组追加在后);
 * 每条收藏经唯一 normalizeUrl 路径规范化判重(与手动添加同源),
 * 重复或无效则跳过,空标题回退主机名(与手动添加同规则)。
 * 待办卡(todo-card,v8):备份待办无天然判重键,一律按新卡追加
 * (卡/条目 id 重生成防冲突),落画布底部追加位;HTML 导入不携带待办,
 * 现有待办原样保留(追加位推算含分组+待办)。
 */
function ingestInto(
  base: BookmarkState,
  incoming: IncomingGroup[],
  incomingTodos: readonly TodoCard[] = []
): { state: BookmarkState; report: ImportReport } {
  const groups = base.groups.map((g) => ({ ...g }));
  const bookmarks = base.bookmarks.map((b) => ({ ...b }));
  const todos = (base.todos ?? []).map((t) => ({ ...t }));
  const byName = new Map(groups.map((g) => [g.name, g]));
  // 本批新建组的落位:画布底部左侧追加,连续新组按堆叠步长排开(同原型)
  const pendingPositions = appendPositions(
    groups,
    incoming.filter((inc) => !byName.has(inc.name)).length
  );
  let nextPosition = 0;
  const seen = new Set(bookmarks.map((b) => b.url));
  let added = 0;
  let skipped = 0;

  for (const inc of incoming) {
    let target: Group | undefined = byName.get(inc.name);
    if (!target) {
      target = {
        id: crypto.randomUUID(),
        name: inc.name,
        color: inc.color,
        order: nextOrder(groups.map((g) => g.order)),
        ...pendingPositions[nextPosition++],
      };
      groups.push(target);
      byName.set(target.name, target);
    }
    for (const parsedBookmark of inc.bookmarks) {
      const url = normalizeUrl(parsedBookmark.url);
      if (url === null || seen.has(url)) {
        skipped += 1;
        continue;
      }
      seen.add(url);
      bookmarks.push({
        id: crypto.randomUUID(),
        url,
        title: parsedBookmark.title.trim() || new URL(url).hostname,
        note: parsedBookmark.note.trim(),
        groupId: target.id,
        order: nextOrder(
          bookmarks.filter((b) => b.groupId === target!.id).map((b) => b.order)
        ),
      });
      added += 1;
    }
  }

  // 备份待办追加为新卡(todo-card,v8):无判重键,一律新建——卡/条目 id
  // 重生成防冲突,内容/完成态/顺序逐字;落画布底部追加位(推算含分组
  // 与既有待办);HTML 导入不携带待办,现部分原样透传
  const pendingTodoPositions = appendPositions(
    [...groups, ...todos],
    incomingTodos.length
  );
  incomingTodos.forEach((todo, i) => {
    todos.push({
      ...todo,
      id: crypto.randomUUID(),
      items: todo.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
      order: nextOrder(todos.map((t) => t.order)),
      ...pendingTodoPositions[i],
    });
  });

  return {
    // 合并保留现有画布宽(merge 只并入收藏布局不动;备份宽仅 replace 生效):
    // 固定宽钳回保留,自动档(缺省)保持自动(schema v5)
    state: {
      schemaVersion: SCHEMA_VERSION,
      ...(base.canvasWidth !== undefined && {
        canvasWidth: clampCanvasWidth(base.canvasWidth),
      }),
      groups,
      bookmarks,
      todos,
    },
    report: { added, skipped },
  };
}

/** 导入 Netscape 书签 HTML:始终为合并模式(文件夹建组、判重跳过)。 */
export async function importBookmarksFromHtml(
  adapter: StorageAdapter,
  html: string
): Promise<Result<ImportReport>> {
  const parsed = parseBookmarksHtml(html);
  if (!parsed.ok) return parsed;
  return ingestParsedBookmarks(adapter, parsed.value);
}

/**
 * 并入解析结果(HTML 书签文件或原生书签树共用):
 * 新分组用导入默认色、根级散项进收集箱、同名并组、normalizeUrl 唯一判重跳过。
 * 前置条件:parsed 非空(各解析函数已拒空)。
 */
export async function ingestParsedBookmarks(
  adapter: StorageAdapter,
  parsed: ParsedBookmarks
): Promise<Result<ImportReport>> {
  const base = (await adapter.load()) ?? emptyState();
  const incoming: IncomingGroup[] = parsed.groups.map((g) => ({
    name: g.name,
    color: IMPORTED_GROUP_COLOR,
    bookmarks: g.bookmarks,
  }));
  if (parsed.inbox.length > 0) {
    incoming.unshift({
      name: INBOX_GROUP_NAME,
      color: INBOX_GROUP_COLOR,
      bookmarks: parsed.inbox,
    });
  }
  const { state, report } = ingestInto(base, incoming);
  await adapter.save(state);
  return { ok: true, value: report };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isGroupShape(v: unknown, requireCoords: boolean): v is Group {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    isNonEmptyString(g.id) &&
    isNonEmptyString(g.name) &&
    isNonEmptyString(g.color) &&
    typeof g.order === "number" &&
    // 画布坐标(schema v3 起):v3 备份必携带且为数字;更早版本无此字段
    (!requireCoords || (typeof g.x === "number" && typeof g.y === "number")) &&
    // 每行条数(schema v6 起)/组宽档位(schema v7 起):可缺省,
    // 给了就必须是数字(非法值迁移链剥离)
    (g.columns === undefined || typeof g.columns === "number") &&
    (g.span === undefined || typeof g.span === "number")
  );
}

function isBookmarkShape(v: unknown): v is Bookmark {
  if (typeof v !== "object" || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    isNonEmptyString(b.id) &&
    isNonEmptyString(b.url) &&
    isNonEmptyString(b.title) &&
    typeof b.note === "string" &&
    isNonEmptyString(b.groupId) &&
    typeof b.order === "number" &&
    // icon 可选(schema v2),给了就必须是非空字符串(data URL)
    (b.icon === undefined || isNonEmptyString(b.icon))
  );
}

/** 待办条目形状(v8,todo-card):写路径保证文本非空、done 为布尔、order 为数。 */
function isTodoItemShape(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const i = v as Record<string, unknown>;
  return (
    isNonEmptyString(i.id) &&
    isNonEmptyString(i.text) &&
    typeof i.done === "boolean" &&
    typeof i.order === "number"
  );
}

/** 待办卡形状(v8,todo-card):坐标必携(同 v3+ 分组口径);条目逐条校验。 */
function isTodoCardShape(v: unknown): v is TodoCard {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    isNonEmptyString(t.id) &&
    isNonEmptyString(t.title) &&
    typeof t.order === "number" &&
    typeof t.x === "number" &&
    typeof t.y === "number" &&
    Array.isArray(t.items) &&
    t.items.every(isTodoItemShape)
  );
}

/** 待办列表形状:必须是数组且逐卡合法(todo-card,v8)。 */
function isTodoArray(v: unknown): v is TodoCard[] {
  return Array.isArray(v) && v.every(isTodoCardShape);
}

/** 逐字段校验备份 JSON 的结构;只有完全合法的完整状态才可导入。 */
function parseStateJson(raw: string): Result<BookmarkState> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-import" };
  }
  if (typeof data !== "object" || data === null)
    return { ok: false, error: "invalid-import" };
  const s = data as Record<string, unknown>;
  // v1 起的旧版本备份均可导入(向前兼容);未来版本(可能带未知结构)拒收
  if (
    typeof s.schemaVersion !== "number" ||
    s.schemaVersion < MIN_IMPORT_SCHEMA_VERSION ||
    s.schemaVersion > SCHEMA_VERSION
  )
    return { ok: false, error: "invalid-import" };
  if (!Array.isArray(s.groups) || !Array.isArray(s.bookmarks)) {
    return { ok: false, error: "invalid-import" };
  }
  const coordsRequired = s.schemaVersion >= 3;
  if (
    !s.groups.every((g) => isGroupShape(g, coordsRequired)) ||
    !s.bookmarks.every(isBookmarkShape)
  ) {
    return { ok: false, error: "invalid-import" };
  }
  // 画布宽(schema v4 起):可缺省(v3 及更早备份、v5 自动档),
  // 给了就必须是数字(NaN/越界在恢复时钳回,不拒收)
  if (s.canvasWidth !== undefined && typeof s.canvasWidth !== "number") {
    return { ok: false, error: "invalid-import" };
  }
  // 待办卡(schema v8 起):可缺省(v7 及更早备份);给了就必须是逐卡合法的数组
  if (s.todos !== undefined && !isTodoArray(s.todos)) {
    return { ok: false, error: "invalid-import" };
  }
  return { ok: true, value: s as unknown as BookmarkState };
}

/**
 * 替换全部:清空后恢复备份(id/顺序/颜色/备注/坐标逐字保留),画布宽随备份
 * (固定宽钳回;缺省 = 自动档,坐标按上限钳界,与 store 自动档同口径),
 * 超档组降档、每行条数连带降到档位(同 setCanvasWidth 口径),按各自宽钳 x;
 * 缺省组不物化 span(渲染口径从 columns 推导,v6 备份往返不变形),
 * 同时修复损坏备份:补回缺失收集箱、孤儿收藏收回收集箱、备份内重复 URL 只留首条。
 */
function restoreFrom(backup: BookmarkState): {
  state: BookmarkState;
  report: ImportReport;
} {
  const canvasWidth = canvasWidthOf(backup);
  const bound = canvasWidth ?? MAX_CANVAS_W;
  const maxColumns = maxSpanForCanvas(bound);
  const groups: Group[] = backup.groups.map((g) => {
    const spanRaw = groupSpanOf(g);
    const spanClamped = Math.min(spanRaw, maxColumns);
    // 非整数 = 非法(v7 同版备份绕过迁移链):按缺省装满处理,不落库
    const columns =
      g.columns === undefined || !Number.isInteger(g.columns)
        ? undefined
        : Math.min(g.columns, spanClamped);
    // 缺省组(span 未存且未超档)保持缺省,不物化;其余写钳后档位
    const span =
      g.span !== undefined || spanClamped !== spanRaw ? spanClamped : undefined;
    return {
      ...g,
      span,
      columns,
      ...clampToCanvas(g, bound, groupWidthOf(spanClamped)),
    };
  });
  if (!groups.some((g) => g.id === INBOX_GROUP_ID)) {
    groups.unshift(
      // 补缺落画布底部追加位(同 store.ensureInbox),不与既有分组重叠
      createInboxGroup(-1, appendPositions(groups)[0])
    );
  }
  const groupIds = new Set(groups.map((g) => g.id));
  const seen = new Set<string>();
  const bookmarks: Bookmark[] = [];
  let skipped = 0;
  for (const backupBookmark of backup.bookmarks) {
    const url = normalizeUrl(backupBookmark.url);
    if (url === null || seen.has(url)) {
      skipped += 1;
      continue;
    }
    seen.add(url);
    bookmarks.push({
      ...backupBookmark,
      url,
      groupId: groupIds.has(backupBookmark.groupId)
        ? backupBookmark.groupId
        : INBOX_GROUP_ID,
    });
  }
  // 待办卡逐字恢复(todo-card,v8;width 自由宽 v10;height 定长 v11):
  // id/标题/条目/顺序原样,宽随画布宽收窄(同分组口径)、坐标按各自宽
  // 钳回画布;v9 备份的档位按旧数学换算为 px(非法档位归缺省);旧备份
  // 无宽度字段则保持缺省不物化;height 有限钳回 [176, 720]、非有限/非数
  // 剥离为自适应(垃圾值不物化定长);v7 及更早备份缺省补空数组
  const todos = (backup.todos ?? []).map(
    (tRaw: TodoCard & { span?: number }) => {
      const raw =
        tRaw.width ??
        (tRaw.span !== undefined ? legacySpanWidth(tRaw.span) : undefined);
      const width =
        raw === undefined ? undefined : clampTodoWidth(Math.min(raw, bound));
      const height =
        typeof tRaw.height === "number" && Number.isFinite(tRaw.height)
          ? clampTodoHeight(tRaw.height)
          : undefined;
      // 剥离 v9 遗留的 span 字段(其余逐字保留;height 剥离非有限遗物)
      const rest: TodoCard & { span?: number } = { ...tRaw };
      delete rest.span;
      if (height === undefined) delete rest.height;
      return {
        ...rest,
        ...(width !== undefined ? { width } : null),
        ...(height !== undefined ? { height } : null),
        ...clampToCanvas(tRaw, bound, width ?? CARD_W),
      };
    }
  );
  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      ...(canvasWidth !== undefined && { canvasWidth }),
      groups,
      bookmarks,
      todos,
    },
    report: { added: bookmarks.length, skipped },
  };
}

/** 导入 JSON 备份:merge 同名并组+判重跳过;replace 清空后逐字恢复。 */
export async function importStateFromJson(
  adapter: StorageAdapter,
  raw: string,
  mode: ImportMode
): Promise<Result<ImportReport>> {
  const parsed = parseStateJson(raw);
  if (!parsed.ok) return parsed;
  // v2 及更早的备份先走同一迁移链(分组装箱出画布坐标),后续两分支只需面对 v3
  const backup =
    parsed.value.schemaVersion < SCHEMA_VERSION
      ? migrateState(parsed.value)
      : parsed.value;

  if (mode === "replace") {
    const { state, report } = restoreFrom(backup);
    await adapter.save(state);
    return { ok: true, value: report };
  }

  const current = (await adapter.load()) ?? emptyState();
  const byGroup = new Map<string, Bookmark[]>();
  for (const bookmark of backup.bookmarks) {
    const list = byGroup.get(bookmark.groupId) ?? [];
    list.push(bookmark);
    byGroup.set(bookmark.groupId, list);
  }
  const incoming: IncomingGroup[] = [...backup.groups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      name: g.name,
      color: g.color,
      bookmarks: (byGroup.get(g.id) ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((b) => ({ url: b.url, title: b.title, note: b.note })),
    }));
  const { state, report } = ingestInto(current, incoming, backup.todos ?? []);
  await adapter.save(state);
  return { ok: true, value: report };
}
