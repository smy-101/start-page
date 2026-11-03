/**
 * 初曦收集箱读取核心:扫描本机所有 Chromium 浏览器 profile 的
 * `Local Extension Settings/<ext-id>/`(chrome.storage.local 的 LevelDB 落盘),
 * 按数据形状识别初曦状态(groups 含 id==='inbox'),按 mtime 取最新一份。
 *
 * 设计要点(为什么这样做):
 * - 不按扩展 id 认目录:unpacked 扩展 id 随安装路径/浏览器变化,且同目录可能
 *   混着其他扩展(实测 Chrome 里同目录是 Bing 推广扩展)。靠「state 键可解析
 *   且含 inbox 分组」识别,天然免疫。
 * - 先拷到 /tmp 再只读打开:避开浏览器持锁与 drvfs 的写语义冲突;LevelDB
 *   log 尾部撕裂属正常容错路径,读失败就跳过该候选。
 * - 完全被动:无需调试端口(Chrome 136+ 也不允许)、无需扩展配合、浏览器
 *   运行中可读。
 */
import { ClassicLevel } from "classic-level";
import { cpSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Windows 用户目录根(WSL 视角)。 */
const WIN_USERS = process.env.SP_WIN_USERS_DIR || "/mnt/c/Users";

/** 浏览器名 → User Data 目录相对用户目录的路径。Chromium 系同构。 */
const BROWSERS = [
  ["Edge", "AppData/Local/Microsoft/Edge/User Data"],
  ["Chrome", "AppData/Local/Google/Chrome/User Data"],
  ["Brave", "AppData/Local/BraveSoftware/Brave-Browser/User Data"],
  ["Vivaldi", "AppData/Local/Vivaldi/User Data"],
  ["Chromium", "AppData/Local/Chromium/User Data"],
  ["Opera", "AppData/Local/Opera Software/Opera Stable"],
];

const PROFILE_RE = /^(Default|Profile \S.*)$/;

/** 目录内最新文件 mtime(ms);无文件返回 null。readdir/stat 期间的并发删除
 * (活跃浏览器轮换 LOCK/MANIFEST/.log)不是错误,当作无候选跳过。 */
function newestMtime(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return null; // 扫描中目录被删(如卸载扩展)→ 非候选
  }
  let newest = null;
  for (const f of names) {
    let m;
    try {
      m = statSync(join(dir, f)).mtimeMs;
    } catch {
      continue; // readdir 与 stat 之间文件消失 → 跳过该文件
    }
    if (newest === null || m > newest) newest = m;
  }
  return newest;
}

/**
 * 尝试把一个扩展数据目录读成初曦状态。
 * @returns {Promise<object|null>} 非初曦(无 state 键 / 不可解析 / 无 inbox 分组)返回 null
 */
async function tryReadState(dir) {
  const tmp = mkdtempSync(join(tmpdir(), "sp-inbox-"));
  try {
    cpSync(dir, tmp, { recursive: true, force: true });
    const db = new ClassicLevel(tmp, { readOnly: true });
    try {
      const raw = await db.get("state");
      const state = JSON.parse(raw);
      if (!isValidState(state)) return null;
      return state;
    } finally {
      await db.close().catch(() => {});
    }
  } catch {
    return null; // 键不存在 / log 撕裂 / 压缩块损坏 → 一律当作非候选
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** 数据形状校验:初曦 BookmarkState 的最小判别式。 */
function isValidState(state) {
  return (
    typeof state === "object" &&
    state !== null &&
    Array.isArray(state.groups) &&
    Array.isArray(state.bookmarks) &&
    state.groups.some((g) => g && g.id === "inbox")
  );
}

/** 列目录下的直接子目录名(可带过滤);目录不存在/不可读返回 []。 */
function listDirs(dir, filter = () => true) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && filter(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * 扫描全部候选,返回按数据新鲜度(mtime 降序)排列的初曦状态列表。
 * 每项:{ browser, profile, extensionId, mtime, mtimeISO, state }
 */
export async function scanStates() {
  const found = [];
  for (const user of listDirs(WIN_USERS)) {
    const userDir = join(WIN_USERS, user);
    for (const [browser, rel] of BROWSERS) {
      const userData = join(userDir, rel);
      for (const profile of listDirs(userData, (n) => PROFILE_RE.test(n))) {
        const les = join(userData, profile, "Local Extension Settings");
        for (const extensionId of listDirs(les)) {
          const dir = join(les, extensionId);
          const mtime = newestMtime(dir);
          if (mtime === null) continue;
          const state = await tryReadState(dir);
          if (state) {
            found.push({
              browser,
              profile,
              extensionId,
              mtime,
              mtimeISO: new Date(mtime).toISOString(),
              state,
            });
          }
        }
      }
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime);
}

/** 收集箱视图:inbox 分组的收藏,按 order 排序,剥 icon(data URL 体积大)。 */
export function inboxView(source) {
  const { state } = source;
  const group = state.groups.find((g) => g.id === "inbox");
  const bookmarks = state.bookmarks
    .filter((b) => b.groupId === "inbox")
    .sort((a, b) => a.order - b.order)
    .map(({ order, title, url, note }) => ({ order, title, url, note }));
  return {
    source: {
      browser: source.browser,
      profile: source.profile,
      dataMtime: source.mtimeISO,
      staleHours: Math.round((Date.now() - source.mtime) / 3_600_000),
    },
    schemaVersion: state.schemaVersion,
    inbox: { name: group.name, color: group.color, count: bookmarks.length },
    totals: { groups: state.groups.length, bookmarks: state.bookmarks.length },
    bookmarks,
  };
}

/** 全量视图(分析整个看板用):分组带统计、收藏剥 icon、待办卡原样。 */
export function fullView(source) {
  const { state } = source;
  const countBy = new Map();
  for (const b of state.bookmarks) {
    countBy.set(b.groupId, (countBy.get(b.groupId) ?? 0) + 1);
  }
  return {
    source: {
      browser: source.browser,
      profile: source.profile,
      dataMtime: source.mtimeISO,
      staleHours: Math.round((Date.now() - source.mtime) / 3_600_000),
    },
    schemaVersion: state.schemaVersion,
    groups: [...state.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        bookmarks: countBy.get(g.id) ?? 0,
      })),
    bookmarks: [...state.bookmarks]
      .sort((a, b) =>
        a.groupId === b.groupId
          ? a.order - b.order
          : a.groupId < b.groupId
            ? -1
            : 1
      )
      .map(({ groupId, order, title, url, note }) => ({
        groupId,
        order,
        title,
        url,
        note,
      })),
    todos: state.todos ?? [],
  };
}
