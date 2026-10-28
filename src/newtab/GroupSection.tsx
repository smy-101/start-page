import type { Bookmark, Group, Result } from '../domain/types'
import type { BookmarkPatch } from '../domain/store'
import { BookmarkCard } from './BookmarkCard'

type GroupSectionProps = {
  group: Group
  bookmarks: Bookmark[]
  onEdit: (id: string, patch: BookmarkPatch) => Promise<Result<Bookmark>>
  onDelete: (id: string) => Promise<Result<string>>
}

/** 分组分区:收藏网格的容器。收集箱是保留分组,空状态提示收藏尚不存在。 */
export function GroupSection({ group, bookmarks, onEdit, onDelete }: GroupSectionProps) {
  return (
    <section className="group" aria-label={group.name}>
      <h2 className="group-name">{group.name}</h2>
      {bookmarks.length === 0 ? (
        <p className="group-empty">还没有收藏</p>
      ) : (
        <ul className="group-grid">
          {bookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              group={group}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
