import { useMemo, useRef, useState } from "react";
import { byOrder } from "../domain/types";
import type { Bookmark, BookmarkId, GroupId } from "../domain/types";

/**
 * 收藏卡片拖拽回调束(useCardDnD 供给,白板/分组卡消费;ADR-0004、
 * board-whiteboard/04 墙退役后仅存组内收藏排序的 HTML5 DnD 体系——
 * 分组移动走画布 Pointer 拖拽,不在本束内)。事件对象先行传入:
 * hook 需设置 effectAllowed/dropEffect 并读取坐标。
 */
export type DragHandlers = {
  onCardDragStart(
    event: React.DragEvent,
    bookmarkId: BookmarkId,
    groupId: GroupId
  ): void;
  onDragEnd(): void;
  /** 分区整体是放置目标:收藏跨组移动时悬停列头/空白 = 追加到组末尾。 */
  onSectionDragOver(event: React.DragEvent, targetGroupId: GroupId): void;
  onSectionDrop(event: React.DragEvent, targetGroupId: GroupId): void;
  /** 卡片是放置目标:按指针上/下半判定插到目标之前/之后。 */
  onCardDragOver(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  onCardDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  /** 指针拖离整块看板:清除插入指示线。 */
  onBoardDragLeave(event: React.DragEvent): void;
};

/** 拖收藏时的插入指示:组内渲染坐标的插入槽位(0=最前)。 */
export type DropHint = { groupId: GroupId; index: number } | null;

/** 拖拽中的收藏卡片(组内排序/跨组移动;ADR-0004 墙退役后仅此一种
 * 拖拽源——分组移动走画布 Pointer 拖拽,不经 DnD 状态)。 */
type Drag = { id: BookmarkId; groupId: GroupId } | null;

/** 落位写回:镜像 moveBookmark 三参(id, 目标组, 插入下标),fire-and-forget。 */
export type MoveBookmark = (
  id: BookmarkId,
  groupId: GroupId,
  index: number
) => void;

/**
 * 收藏排序拖拽深 module(card-dnd-deepen/01):插入几何、指示线与
 * 落位写回全部收进 hook,组件只消费两个出口——
 *
 * - `dropHint`:高频值出口(指示线渲染),同槽位保对象引用(下游 memo 的根);
 * - `handlers`:引用稳定出口(三层透传),内部读 ref 镜像,
 *   `bookmarks` / `onMove` 无须稳定身份,不成为调用者义务。
 *
 * bookmarks 进全量状态(搜索过滤视图的落点按完整状态算,不可见项计入
 * 下标);hook 不订阅 store,对 `Result` 错误模式零知识——错误翻译留在
 * 调用方的 onMove(App 的 `run()`)。范围仅 HTML5 DnD 收藏排序;
 * 白板模式的画布 Pointer 分组拖拽(Whiteboard 的 DragPos)不在本模块。
 */
export function useCardDnD(
  bookmarks: Bookmark[],
  onMove: MoveBookmark
): { dropHint: DropHint; handlers: DragHandlers } {
  // 指示线是唯一驱动渲染的拖拽状态;被拖项身份只进 ref(渲染不消费,
  // 悬停/落位逻辑经 ref 读最新值,无 setState 时滞)
  const [dropHint, setDropHint] = useState<DropHint>(null);
  const dragRef = useRef<Drag>(null);
  // 参数镜像:每次 render 刷新,handlers 读最新值而身份不变
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  /** 放置前置条件:dragover 阻止默认行为并声明 move 光标,浏览器才允许 drop。 */
  const allowDrop = (event: React.DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };

  /** 拖拽源声明:只允许移动(光标不出现复制加号)。jsdom 事件无 dataTransfer,守卫。 */
  const markDragSource = (event: React.DragEvent) => {
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };

  /** 目标组内按 order 排序的全量收藏(调用方自行排除被拖项)。 */
  const orderedIn = (groupId: GroupId) =>
    bookmarksRef.current.filter((b) => b.groupId === groupId).sort(byOrder);

  /** 拖收藏悬停在某卡片上/下半:插入槽位(目标组坐标,不含被拖项)。 */
  function cardInsertionIndex(
    event: React.DragEvent,
    target: Bookmark,
    draggedId: BookmarkId
  ): number {
    const siblings = orderedIn(target.groupId).filter(
      (b) => b.id !== draggedId
    );
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    // jsdom 量高为 0:视为悬停上半(与既有「插到目标之前」行为一致)
    const after = rect.height > 0 && event.clientY - rect.top > rect.height / 2;
    const at = siblings.findIndex((b) => b.id === target.id);
    if (at < 0) {
      // 悬停在被拖卡片自身:前/后都是原位(无操作),指示线贴自身前/后
      const p = orderedIn(target.groupId).findIndex((b) => b.id === target.id);
      return after ? p + 1 : p;
    }
    return at + (after ? 1 : 0);
  }

  /** 追加到目标组末尾的下标:按完整状态计算(搜索过滤视图下同样落到真实末尾)。 */
  const appendIndex = (groupId: GroupId, draggedId: BookmarkId) =>
    orderedIn(groupId).filter((b) => b.id !== draggedId).length;

  /** 更新插入指示线:槽位换算到目标组的渲染坐标(被拖项还在列内)。 */
  const hintAt = (groupId: GroupId, insertion: number) => {
    const current = dragRef.current;
    setDropHint((prev) => {
      let index = insertion;
      if (current && current.groupId === groupId) {
        const p = orderedIn(groupId).findIndex((b) => b.id === current.id);
        if (p >= 0 && p < insertion) index = insertion + 1;
      }
      return prev && prev.groupId === groupId && prev.index === index
        ? prev
        : { groupId, index };
    });
  };

  /** 分区放置:拖收藏→追加到目标组末尾。 */
  const handleSectionDrop = (
    _event: React.DragEvent,
    targetGroupId: GroupId
  ) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDropHint(null);
    if (!current) return;
    onMoveRef.current(
      current.id,
      targetGroupId,
      appendIndex(targetGroupId, current.id)
    );
  };

  /** 卡片放置:按悬停上/下半插到目标之前/之后(组内排序与跨组移动共用)。 */
  const handleCardDrop = (
    event: React.DragEvent,
    targetBookmarkId: BookmarkId
  ) => {
    const current = dragRef.current;
    if (!current) return;
    // 收藏拖放由卡片就地处理,不再冒泡给分区(避免二次追加)
    event.stopPropagation();
    dragRef.current = null;
    setDropHint(null);
    if (current.id === targetBookmarkId) return;
    const target = bookmarksRef.current.find((b) => b.id === targetBookmarkId);
    if (!target) return;
    const index = cardInsertionIndex(event, target, current.id);
    onMoveRef.current(current.id, target.groupId, index);
  };

  // 回调束引用稳定:全部逻辑经 ref 读最新值,deps 恒空
  const handlers = useMemo<DragHandlers>(
    () => ({
      onCardDragStart: (event, bookmarkId, groupId) => {
        markDragSource(event);
        dragRef.current = { id: bookmarkId, groupId };
      },
      onDragEnd: () => {
        dragRef.current = null;
        setDropHint(null);
      },
      onSectionDragOver: (event, targetGroupId) => {
        allowDrop(event);
        // 拖收藏悬停在非卡片区(列头/空白):指示追加到该组末尾
        const current = dragRef.current;
        if (!current) return;
        hintAt(targetGroupId, appendIndex(targetGroupId, current.id));
      },
      onSectionDrop: handleSectionDrop,
      onCardDragOver: (event, targetBookmarkId) => {
        event.preventDefault();
        const current = dragRef.current;
        if (!current) return;
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const target = bookmarksRef.current.find(
          (b) => b.id === targetBookmarkId
        );
        if (!target) return;
        hintAt(target.groupId, cardInsertionIndex(event, target, current.id));
      },
      onCardDrop: handleCardDrop,
      onBoardDragLeave: (event) => {
        // 拖拽整块看板拖离才清指示线;组内/组间移动触发的 dragleave 不算
        const to = event.relatedTarget;
        if (!(to instanceof Node) || !event.currentTarget.contains(to)) {
          setDropHint(null);
        }
      },
    }),
    []
  );

  return { dropHint, handlers };
}
