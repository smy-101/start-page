/** 收藏:一条被保存的网页记录,必属且仅属一个分组(见 GLOSSARY.md)。 */
export type BookmarkId = string
export type GroupId = string

export interface Bookmark {
  id: BookmarkId
  /** 规范化后的 URL(判重与展示共用此值) */
  url: string
  title: string
  note: string
  groupId: GroupId
  /** 组内顺序,组内递增分配 */
  order: number
}

/** 分组:收藏的具名容器,扁平不嵌套。 */
export interface Group {
  id: GroupId
  name: string
  /** 十六进制颜色,如 #3b82f6 */
  color: string
  order: number
}

/** 单一状态对象,整体持久化到 chrome.storage.local。 */
export interface BookmarkState {
  schemaVersion: number
  groups: Group[]
  bookmarks: Bookmark[]
}

/**
 * 持久化适配器:领域层唯一的存储缝隙。
 * 真实实现走 chrome.storage.local,测试用内存实现;领域层零 chrome.* 依赖。
 */
export interface StorageAdapter {
  load(): Promise<BookmarkState | null>
  save(state: BookmarkState): Promise<void>
  /**
   * 状态被写入时通知(含写入方自己与其他扩展上下文,如 service worker)。
 * 可选:消费者据此重建收藏库,实现跨上下文同步。返回取消订阅函数。
   */
  subscribe?(listener: () => void): () => void
}

/** 领域操作失败码,UI 层据此给出中文提示。 */
export type DomainErrorCode =
  | 'invalid-url'
  | 'duplicate-url'
  | 'bookmark-not-found'
  | 'group-not-found'
  | 'empty-group-name'
  | 'empty-group-color'
  | 'invalid-import'

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainErrorCode }

/** 当前数据结构版本,随结构演进递增(导入导出的 JSON 备份依赖它)。 */
export const SCHEMA_VERSION = 1

/** 收集箱:保留分组,固定 id,永远存在、不可删除。 */
export const INBOX_GROUP_ID = 'inbox'

/** 收集箱的显示名(状态中的分组名)。 */
export const INBOX_GROUP_NAME = '收集箱'

/** 收集箱的默认颜色(浅色蓝,深浅色下均可辨识)。 */
export const INBOX_GROUP_COLOR = '#3b82f6'
