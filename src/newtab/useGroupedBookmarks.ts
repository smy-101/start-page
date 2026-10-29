import { useMemo, useRef } from "react";
import { byOrder } from "../domain/types";
import type { Bookmark, Group, GroupId } from "../domain/types";

function sameItems<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * 组内收藏列表:内容未变(逐项同引用)时复用上一次的数组实例,
 * 使无关变更不打破下游 GroupSection/BookmarkCard 的 memo。
 * 墙(BookmarkGroups)与白板(Whiteboard)共用。
 */
export function useGroupedBookmarks(
  bookmarks: Bookmark[],
  groups: Group[]
): Map<GroupId, Bookmark[]> {
  const cacheRef = useRef(new Map<GroupId, Bookmark[]>());
  return useMemo(() => {
    const next = new Map<GroupId, Bookmark[]>();
    for (const group of groups) {
      const fresh = bookmarks
        .filter((bookmark) => bookmark.groupId === group.id)
        .sort(byOrder);
      const prev = cacheRef.current.get(group.id);
      next.set(group.id, prev && sameItems(prev, fresh) ? prev : fresh);
    }
    cacheRef.current = next;
    return next;
  }, [bookmarks, groups]);
}
