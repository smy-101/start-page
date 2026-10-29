import { memo } from "react";
import type { CSSProperties } from "react";
import type {
  Bookmark,
  BookmarkId,
  DeleteGroupResult,
  Group,
  GroupId,
  Result,
} from "../domain/types";
import type { BookmarkPatch } from "../domain/store";
import { BookmarkCard } from "./BookmarkCard";
import { GroupHeader } from "./GroupHeader";

type GroupSectionProps = {
  group: Group;
  bookmarks: Bookmark[];
  /** 全部分组(按 order 排序):行编辑换组的选择候选 */
  groups: Group[];
  /** 编辑模式:列头出分组操作、行出编辑删除,均可拖拽(ui-refresh/04) */
  editMode: boolean;
  /** 共享回调(稳定身份):本组件以自身 group/bookmark 数据供给 id。 */
  onRename(id: GroupId, name: string): Promise<Result<Group>>;
  onRecolor(id: GroupId, color: string): Promise<Result<Group>>;
  onDeleteGroup(id: GroupId): Promise<DeleteGroupResult>;
  onGroupDragStart(groupId: GroupId): void;
  onCardDragStart(bookmarkId: BookmarkId, groupId: GroupId): void;
  onDragEnd(): void;
  onSectionDragOver(event: React.DragEvent): void;
  onSectionDrop(event: React.DragEvent, targetGroupId: GroupId): void;
  onCardDragOver(event: React.DragEvent): void;
  onCardDrop(event: React.DragEvent, targetBookmarkId: BookmarkId): void;
  onEdit: (id: BookmarkId, patch: BookmarkPatch) => Promise<Result<Bookmark>>;
  onDelete: (id: BookmarkId) => Promise<Result<BookmarkId>>;
};

/**
 * 看板列(ui-refresh/04):分组的列容器,常显不折叠。收集箱是保留分组,列头只读。
 * memo:props(分组对象、组内列表、共享回调)未变时跳过重渲染(工单 10a)。
 */
export const GroupSection = memo(function GroupSection({
  group,
  bookmarks,
  groups,
  editMode,
  onRename,
  onRecolor,
  onDeleteGroup,
  onGroupDragStart,
  onCardDragStart,
  onDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onCardDragOver,
  onCardDrop,
  onEdit,
  onDelete,
}: GroupSectionProps) {
  return (
    <section
      className="group"
      aria-label={group.name}
      // 分组色注入为 CSS 变量:左脊/悬停边框等着色用(纯表现,不影响语义)
      style={{ "--group-color": group.color } as CSSProperties}
      onDragOver={onSectionDragOver}
      onDrop={(event) => onSectionDrop(event, group.id)}
    >
      <GroupHeader
        group={group}
        bookmarkCount={bookmarks.length}
        editMode={editMode}
        onRename={(name) => onRename(group.id, name)}
        onRecolor={(color) => onRecolor(group.id, color)}
        onDeleteGroup={() => onDeleteGroup(group.id)}
        onDragStart={() => onGroupDragStart(group.id)}
        onDragEnd={onDragEnd}
      />
      {bookmarks.length === 0 ? (
        <p className="group-empty">还没有收藏</p>
      ) : (
        <ul className="group-grid">
          {bookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              group={group}
              groups={groups}
              editMode={editMode}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragStart={onCardDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onCardDragOver}
              onDrop={onCardDrop}
            />
          ))}
        </ul>
      )}
    </section>
  );
});
