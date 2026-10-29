import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { byOrder } from "../domain/types";
import type {
  Bookmark,
  BookmarkId,
  BookmarkState,
  GroupId,
  Result,
  StorageAdapter,
} from "../domain/types";
import {
  createBookmarkStore,
  isFreshInstallState,
  statesEqual,
} from "../domain/store";
import type {
  BookmarkStore,
  BookmarkPatch,
  NewBookmarkInput,
  NewGroupInput,
} from "../domain/store";
import { filterState } from "../domain/search";
import { createChromeStorage } from "../storage/chromeStorage";
import type { NativeBookmarkNode } from "../domain/nativeImport";
import { AddDialog } from "./AddDialog";
import { BookmarkGroups } from "./BookmarkGroups";
import { SearchBox } from "./SearchBox";
import { SettingsView } from "./SettingsView";
import { searchUrl } from "./searchEngine";
import type { EngineId } from "./searchEngine";
import {
  createChromeSettingsStorage,
  DEFAULT_SETTINGS,
  loadSettings,
} from "./settings";
import type { Settings, SettingsAdapter } from "./settings";
import { getNativeBookmarkTree } from "./nativeBookmarks";
import { importNativeBookmarks } from "../domain/nativeImport";
import { importReportText } from "./messages";
import { ImportCta } from "./ImportCta";
import { fetchSiteMeta } from "../domain/fetchSiteMeta";
import {
  hasHostPermission,
  requestHostPermission,
} from "../platform/iconPermission";
import { domainErrorText } from "./messages";
import { PlusIcon, SettingsIcon } from "./Icon";
import { loadCollapsedGroups, saveCollapsedGroups } from "./collapsedGroups";
import type { DragHandlers } from "./BookmarkGroups";

const chromeStorage = createChromeStorage();
const chromeSettingsStorage = createChromeSettingsStorage();

/** 拖拽中对象:整个分组(组间排序)或收藏卡片(组内排序/跨组移动)。 */
type Drag =
  | { kind: "group"; id: GroupId }
  | { kind: "bookmark"; id: BookmarkId; groupId: GroupId }
  | null;

type AppProps = {
  /** 注入存储适配器;缺省用 chrome.storage.local(测试注入内存适配器) */
  adapter?: StorageAdapter;
  /** 设置存储适配器(引擎选择等,与收藏状态分开存储);测试注入内存实现 */
  settingsAdapter?: SettingsAdapter;
  /** 原生书签树读取缝隙;测试注入假树 */
  getBookmarkTree?: () => Promise<NativeBookmarkNode[]>;
};

export function App({
  adapter = chromeStorage,
  settingsAdapter = chromeSettingsStorage,
  getBookmarkTree = getNativeBookmarkTree,
}: AppProps) {
  const [store, setStore] = useState<BookmarkStore | null>(null);
  const [state, setState] = useState<BookmarkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 导入会绕过 store 直接写适配器;递增此计数强制重建 store 重读状态
  // (适配器 subscribe 亦会触发;此处与跨上下文同步机制并存,epoch 保底刷新)
  const [storeEpoch, setStoreEpoch] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // 输入走紧急通道(搜索框即时回显);大列表的重挂/卸载走延迟通道,不阻塞输入(工单 10a)
  const deferredQuery = useDeferredValue(query);
  const [view, setView] = useState<"start" | "settings">("start");
  const [addOpen, setAddOpen] = useState(false);
  // 编辑模式(ui-refresh/04):开启后收藏行/分组列头才出现编辑删除与拖拽
  const [editMode, setEditMode] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [drag, setDrag] = useState<Drag>(null);
  // 折叠分组集(board-refresh/03):默认空集全部展开,localStorage 持久化
  const [collapsedGroups, setCollapsedGroups] = useState<Set<GroupId>>(() =>
    loadCollapsedGroups()
  );
  // 原生导入进行中(空状态引导钮按钮态,board-refresh/06)
  const [importing, setImporting] = useState(false);

  // 最新值引用:下方稳定回调读取,使回调身份不随状态变化(分组/卡片 memo 的前提)
  const storeRef = useRef<BookmarkStore | null>(null);
  const stateRef = useRef<BookmarkState | null>(null);
  const settingsRef = useRef(settings);
  const dragRef = useRef<Drag>(drag);
  storeRef.current = store;
  stateRef.current = state;
  settingsRef.current = settings;
  dragRef.current = drag;

  useEffect(() => {
    let cancelled = false;
    // 序号防止乱序:仅最后一次重建生效(自身写入与 service worker 写入都会触发)
    let bootSeq = 0;
    async function boot() {
      const current = ++bootSeq;
      const created = await createBookmarkStore(adapter);
      if (cancelled || current !== bootSeq) return;
      const next = created.getState();
      // 回声抑制:加载到的状态与当前一致(典型为自身写入的 onChanged 回声)
      // → 跳过重建;外部上下文写入携带不同状态,仍会正常替换
      setStore((prev) =>
        prev && statesEqual(prev.getState(), next) ? prev : created
      );
      setState((prev) => (prev && statesEqual(prev, next) ? prev : next));
    }
    void boot();
    // 跨上下文同步:任何上下文写入状态(含本页自己)→ 重建收藏库重渲染
    const unsubscribe = adapter.subscribe?.(() => {
      void boot();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [adapter, storeEpoch]);

  useEffect(() => {
    let cancelled = false;
    // 读取失败时保持默认设置:引擎设置不阻塞初始页(存值损坏也由 loadSettings 回退默认)
    loadSettings(settingsAdapter)
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settingsAdapter]);

  const refresh = useCallback(() => {
    setState(storeRef.current!.getState());
  }, []);

  /** 领域操作的统一包装:成功刷新视图,失败给出中文提示。 */
  const run = useCallback(
    async <T,>(action: () => Promise<Result<T>>): Promise<Result<T>> => {
      const result = await action();
      if (result.ok) {
        setError(null);
        refresh();
      } else {
        setError(domainErrorText[result.error]);
      }
      return result;
    },
    [refresh]
  );

  /** 表单类操作:成功即刷新,错误由表单就地展示(而非页面顶部)。 */
  const refreshOnOk = useCallback(
    async <T,>(action: () => Promise<Result<T>>): Promise<Result<T>> => {
      const result = await action();
      if (result.ok) refresh();
      return result;
    },
    [refresh]
  );

  // ---- 进入 BookmarkGroups 的回调:全部稳定身份(memo 契约) ----

  const handleRenameGroup = useCallback(
    (id: GroupId, name: string) =>
      refreshOnOk(() => storeRef.current!.renameGroup(id, name)),
    [refreshOnOk]
  );

  const handleRecolorGroup = useCallback(
    (id: GroupId, color: string) =>
      refreshOnOk(() => storeRef.current!.recolorGroup(id, color)),
    [refreshOnOk]
  );

  const handleDeleteGroup = useCallback(
    async (id: GroupId) => {
      const group = stateRef.current?.groups.find((g) => g.id === id);
      const result = await refreshOnOk(() => storeRef.current!.deleteGroup(id));
      if (result.ok) {
        // 删除分组同步剔除折叠集里的惰性 id,不残留到存储(board-refresh/03)
        setCollapsedGroups((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          saveCollapsedGroups(next);
          return next;
        });
        const count = result.value.recycledIds.length;
        setNotice(
          count > 0
            ? `已删除分组「${group?.name ?? ""}」,${count} 条收藏已移入收集箱`
            : `已删除分组「${group?.name ?? ""}」`
        );
      }
      return result;
    },
    [refreshOnOk]
  );

  /** 折叠/展开分组:就地更新集合并落盘(稳定身份,memo 前提)。 */
  const handleToggleCollapse = useCallback((id: GroupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  /** 放置前置条件:dragover 阻止默认行为,浏览器才允许 drop。 */
  const allowDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  /** 分区放置:拖组→与目标组换位;拖收藏→追加到目标组末尾。 */
  const handleSectionDrop = useCallback(
    (_event: React.DragEvent, targetGroupId: GroupId) => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      if (current.kind === "group") {
        if (current.id === targetGroupId) return;
        const without = [...(stateRef.current?.groups ?? [])]
          .sort(byOrder)
          .map((g) => g.id)
          .filter((id) => id !== current.id);
        without.splice(without.indexOf(targetGroupId), 0, current.id);
        void run(() => storeRef.current!.reorderGroups(without));
      } else {
        // 下标按完整状态计算,搜索过滤视图下拖拽同样落到真实末尾
        const index = (stateRef.current?.bookmarks ?? []).filter(
          (b) => b.groupId === targetGroupId && b.id !== current.id
        ).length;
        void run(() =>
          storeRef.current!.moveBookmark(current.id, targetGroupId, index)
        );
      }
    },
    [run]
  );

  /** 卡片放置:移到目标卡片之前(组内排序与跨组移动共用);拖组则冒泡给分区。 */
  const handleCardDrop = useCallback(
    (event: React.DragEvent, targetBookmarkId: BookmarkId) => {
      const current = dragRef.current;
      if (!current || current.kind === "group") return;
      // 收藏拖放由卡片就地处理,不再冒泡给分区(避免二次追加)
      event.stopPropagation();
      setDrag(null);
      if (current.id === targetBookmarkId) return;
      const target = stateRef.current?.bookmarks.find(
        (b) => b.id === targetBookmarkId
      );
      if (!target) return;
      const index = stateRef
        .current!.bookmarks.filter(
          (b) => b.groupId === target.groupId && b.id !== current.id
        )
        .sort(byOrder)
        .findIndex((b) => b.id === targetBookmarkId);
      void run(() =>
        storeRef.current!.moveBookmark(current.id, target.groupId, index)
      );
    },
    [run]
  );

  const handleCardEdit = useCallback(
    async (id: BookmarkId, patch: BookmarkPatch) => {
      const result = await storeRef.current!.updateBookmark(id, patch);
      if (result.ok) refresh();
      return result;
    },
    [refresh]
  );

  const handleCardDelete = useCallback(
    async (id: BookmarkId) => {
      const result = await storeRef.current!.removeBookmark(id);
      if (result.ok) refresh();
      return result;
    },
    [refresh]
  );

  // 拖拽回调束(DragHandlers):表头换位 + 卡片组内排序/跨组移动
  const dragHandlers: DragHandlers = useMemo(
    () => ({
      onGroupDragStart: (groupId) => setDrag({ kind: "group", id: groupId }),
      onCardDragStart: (bookmarkId, groupId) =>
        setDrag({ kind: "bookmark", id: bookmarkId, groupId }),
      onDragEnd: () => setDrag(null),
      onSectionDragOver: allowDrop,
      onSectionDrop: handleSectionDrop,
      onCardDragOver: allowDrop,
      onCardDrop: handleCardDrop,
    }),
    [allowDrop, handleSectionDrop, handleCardDrop]
  );

  /** 换引擎即存,回车立即生效(设置全量落盘,保留 iconFetch 开关) */
  const handleEngineChange = useCallback(
    async (engine: EngineId) => {
      const next: Settings = { ...settingsRef.current, engine };
      setSettings(next);
      await settingsAdapter.save(next);
    },
    [settingsAdapter]
  );

  /** 图标抓取开关(设置页);重新打开后下次添加会再请求授权 */
  const handleToggleIconFetch = useCallback(
    async (iconFetch: boolean) => {
      const next: Settings = { ...settingsRef.current, iconFetch };
      setSettings(next);
      await settingsAdapter.save(next);
    },
    [settingsAdapter]
  );

  /** 回车:新开标签页按所选引擎搜索输入词;空白不跳转 */
  const handleSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    window.open(
      searchUrl(trimmed, settingsRef.current.engine),
      "_blank",
      "noopener"
    );
  }, []);

  // 选分组候选用全量分组(搜索过滤视图下也不缩水),按 order 排序、含收集箱
  // 依赖 groups 引用:收藏增删改不重建此数组,保住下游 memo 链
  const groupsInOrder = useMemo(
    () => (state ? [...state.groups].sort(byOrder) : []),
    [state?.groups]
  );

  if (!store || !state) {
    return (
      <main className="page">
        <p className="loading">加载中…</p>
      </main>
    );
  }

  async function handleAdd(input: NewBookmarkInput) {
    setNotice(null);
    // 错误由弹窗内表单就地展示(ui-refresh/02),不走页面顶部通道
    const result = await refreshOnOk(() =>
      storeRef.current!.addBookmark(input)
    );
    if (result.ok) {
      // 异步补图标:不阻塞添加主流程(先入库、后增强)
      void enrichIconAfterAdd(result.value, !input.title?.trim());
    }
    return result;
  }

  /**
   * 添加成功后抓网页图标回填(board-refresh/05),全部尽力而为:
   * 开关关/无权限/网络失败均静默回退(_favicon/首字母),拒绝授权自动关开关防反复弹窗。
   */
  async function enrichIconAfterAdd(
    bookmark: Bookmark,
    titleWasBlank: boolean
  ) {
    if (!settingsRef.current.iconFetch) return;
    try {
      if (!(await hasHostPermission())) {
        if (!(await requestHostPermission())) {
          const next: Settings = { ...settingsRef.current, iconFetch: false };
          setSettings(next);
          await settingsAdapter.save(next);
          return;
        }
      }
      const meta = await fetchSiteMeta(bookmark.url);
      const patch: BookmarkPatch = {};
      if (meta.icon) patch.icon = meta.icon;
      // 标题留空时用页面 <title>(优于裸主机名)
      if (titleWasBlank && meta.title) patch.title = meta.title;
      if (patch.icon || patch.title) {
        await storeRef.current!.updateBookmark(bookmark.id, patch);
        refresh();
      }
    } catch {
      // 增强失败不影响已完成的添加
    }
  }

  /** 新建分组(ui-refresh/04:看板列常显,不再默认折叠)。 */
  async function handleCreateGroup(input: NewGroupInput) {
    const result = await storeRef.current!.createGroup(input);
    if (result.ok) {
      refresh();
    }
    return result;
  }

  function bumpStoreEpoch() {
    setStoreEpoch((epoch) => epoch + 1);
  }

  /** 原生书签导入(空状态引导与设置页同一管线,board-refresh/06)。 */
  async function handleImportNative() {
    setImporting(true);
    try {
      const result = await importNativeBookmarks(
        adapter,
        await getBookmarkTree()
      );
      if (result.ok) {
        setError(null);
        setNotice(importReportText(result.value));
        bumpStoreEpoch();
      } else {
        setNotice("浏览器书签为空,没有可导入的书签");
      }
    } catch {
      setNotice("读取浏览器书签失败,请稍后重试");
    } finally {
      setImporting(false);
    }
  }

  // 查询为空时原样返回(完整分组视图);有查询时隐藏无命中的收藏与分组;
  // 用延迟值过滤:过滤重活不阻塞输入本身
  const visible = filterState(state, deferredQuery);

  if (view === "settings") {
    return (
      <SettingsView
        onBack={() => startTransition(() => setView("start"))}
        state={state}
        adapter={adapter}
        onImported={bumpStoreEpoch}
        getBookmarkTree={getBookmarkTree}
        iconFetch={settings.iconFetch}
        onToggleIconFetch={(enabled) => void handleToggleIconFetch(enabled)}
      />
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">初始页</h1>
        <span className="header-actions">
          <button
            type="button"
            className="edit-toggle"
            aria-pressed={editMode}
            onClick={() => setEditMode((on) => !on)}
          >
            {editMode ? "完成" : "编辑"}
          </button>
          <button
            type="button"
            className="gear-button icon-button"
            aria-label="设置"
            title="设置"
            onClick={() => startTransition(() => setView("settings"))}
          >
            <SettingsIcon size={18} />
          </button>
        </span>
      </header>
      <div className="search-row">
        <SearchBox
          query={query}
          engine={settings.engine}
          onChange={setQuery}
          onSearch={handleSearch}
          onEngineChange={(engine) => void handleEngineChange(engine)}
        />
        <button
          type="button"
          className="add-button"
          aria-label="添加收藏或分组"
          title="添加收藏或分组"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon size={20} />
        </button>
      </div>
      {addOpen && (
        <AddDialog
          groups={groupsInOrder}
          onClose={() => setAddOpen(false)}
          onAdd={handleAdd}
          onCreateGroup={handleCreateGroup}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {/* 全新安装(仅收集箱、零收藏)且未在搜索:看板上方给一次性导入引导 */}
      {isFreshInstallState(state) && deferredQuery.trim() === "" && (
        <ImportCta
          importing={importing}
          onImport={() => void handleImportNative()}
          onManualAdd={() => setAddOpen(true)}
        />
      )}
      <BookmarkGroups
        state={visible}
        groups={groupsInOrder}
        searching={deferredQuery.trim() !== ""}
        collapsedIds={collapsedGroups}
        editMode={editMode}
        onToggleCollapse={handleToggleCollapse}
        onRenameGroup={handleRenameGroup}
        onRecolorGroup={handleRecolorGroup}
        onDeleteGroup={handleDeleteGroup}
        {...dragHandlers}
        onEdit={handleCardEdit}
        onDelete={handleCardDelete}
      />
    </main>
  );
}
