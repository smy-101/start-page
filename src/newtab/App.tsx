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
import type { SettingsAdapter } from "./settings";
import { getNativeBookmarkTree } from "./nativeBookmarks";
import { loadCollapsedGroups, saveCollapsedGroups } from "./collapsedGroups";
import { domainErrorText } from "./messages";
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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // 折叠是 UI 状态:localStorage 侧通道持久化,刷新后保持
  const [collapsed, setCollapsed] = useState<Set<GroupId>>(
    () => loadCollapsedGroups().ids
  );
  const [drag, setDrag] = useState<Drag>(null);

  // 最新值引用:下方稳定回调读取,使回调身份不随状态变化(分组/卡片 memo 的前提)
  const storeRef = useRef<BookmarkStore | null>(null);
  const stateRef = useRef<BookmarkState | null>(null);
  const collapsedRef = useRef(collapsed);
  // 首启折叠缺省只判定一次(工单 10b):后续 boot(跨上下文同步/epoch)不再进入
  const collapseDefaultRef = useRef(false);
  const settingsRef = useRef(settings);
  const dragRef = useRef<Drag>(drag);
  storeRef.current = store;
  stateRef.current = state;
  collapsedRef.current = collapsed;
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
      // 折叠缺省(工单 10b):偏好未记录时,全新安装(仍是初始态)首屏全部折叠
      // 并落盘;老用户不命中也不写键,视图维持展开 —— 升级不重置已持久化状态
      if (!collapseDefaultRef.current) {
        collapseDefaultRef.current = true;
        if (!loadCollapsedGroups().recorded && isFreshInstallState(next)) {
          const ids = new Set(next.groups.map((g) => g.id));
          saveCollapsedGroups(ids);
          setCollapsed(ids);
        }
      }
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

  const handleToggleCollapse = useCallback((groupId: GroupId) => {
    const next = new Set(collapsedRef.current);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    saveCollapsedGroups(next);
    setCollapsed(next);
  }, []);

  /** 折叠指定分组并持久化(新建分组默认折叠,工单 10b)。 */
  const collapseGroup = useCallback((groupId: GroupId) => {
    const next = new Set(collapsedRef.current);
    next.add(groupId);
    saveCollapsedGroups(next);
    setCollapsed(next);
  }, []);

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

  /** 换引擎即存,回车立即生效 */
  const handleEngineChange = useCallback(
    async (engine: EngineId) => {
      setSettings({ engine });
      await settingsAdapter.save({ engine });
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
    return refreshOnOk(() => storeRef.current!.addBookmark(input));
  }

  /** 新建分组:成功即折叠(工单 10b 产品行为:新组首屏只挂表头),与刷新同批提交。 */
  async function handleCreateGroup(input: NewGroupInput) {
    const result = await storeRef.current!.createGroup(input);
    if (result.ok) {
      refresh();
      collapseGroup(result.value.id);
    }
    return result;
  }

  function bumpStoreEpoch() {
    setStoreEpoch((epoch) => epoch + 1);
  }

  // 查询为空时原样返回(完整分组视图);有查询时隐藏无命中的收藏与分组;
  // 用延迟值过滤:过滤重活不阻塞输入本身
  const visible = filterState(state, deferredQuery);

  if (view === "settings") {
    return (
      <SettingsView
        settings={settings}
        onEngineChange={(engine) => void handleEngineChange(engine)}
        onBack={() => startTransition(() => setView("start"))}
        state={state}
        adapter={adapter}
        onImported={bumpStoreEpoch}
        getBookmarkTree={getBookmarkTree}
      />
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1 className="page-title">初始页</h1>
        {/* 工单 08:导入导出迁入设置页,头部只保留齿轮入口 */}
        <button
          type="button"
          className="gear-button"
          aria-label="设置"
          onClick={() => startTransition(() => setView("settings"))}
        >
          ⚙ 设置
        </button>
      </header>
      <div className="search-row">
        <SearchBox query={query} onChange={setQuery} onSearch={handleSearch} />
        <button
          type="button"
          className="add-button"
          aria-label="添加收藏或分组"
          title="添加收藏或分组"
          onClick={() => setAddOpen(true)}
        >
          ＋
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
      <BookmarkGroups
        state={visible}
        groups={groupsInOrder}
        searching={deferredQuery.trim() !== ""}
        collapsedGroups={collapsed}
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
