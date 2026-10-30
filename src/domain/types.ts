/** 收藏:一条被保存的网页记录,必属且仅属一个分组(见 GLOSSARY.md)。 */
export type BookmarkId = string;
export type GroupId = string;

export interface Bookmark {
  id: BookmarkId;
  /** 规范化后的 URL(判重与展示共用此值) */
  url: string;
  title: string;
  note: string;
  groupId: GroupId;
  /** 组内顺序,组内递增分配 */
  order: number;
  /**
   * 网页图标 data URL(schema v2,board-refresh/05):添加时抓取存入,
   * 离线可用、不依赖 favicon 缓存。缺省回退 _favicon 端点/首字母方块。
   */
  icon?: string;
}

/** 分组:收藏的具名容器,扁平不嵌套。 */
export interface Group {
  id: GroupId;
  name: string;
  /** 十六进制颜色,如 #3b82f6 */
  color: string;
  order: number;
  /** 画布横坐标(px,schema v3,board-whiteboard/01):白板自由定位,松手吸附 16px 网格取整 */
  x: number;
  /** 画布纵坐标(px,schema v3):画布向下无界 */
  y: number;
}

/** 单一状态对象,整体持久化到 chrome.storage.local。 */
export interface BookmarkState {
  schemaVersion: number;
  groups: Group[];
  bookmarks: Bookmark[];
  /**
   * 画布宽(px,schema v4 起):拖柄钉住后入库,读取统一走 canvas.ts。
   * 缺省 = 自动档(schema v5):撑满可用宽(effectiveCanvasWidth);
   * 可选同时也是旧测试夹具与防御运行时的口径(归一见 canvasWidthOf)。
   */
  canvasWidth?: number;
}

/**
 * 持久化适配器:领域层唯一的存储缝隙。
 * 真实实现走 chrome.storage.local,测试用内存实现;领域层零 chrome.* 依赖。
 */
export interface StorageAdapter {
  load(): Promise<BookmarkState | null>;
  save(state: BookmarkState): Promise<void>;
  /**
   * 状态被写入时通知(含写入方自己与其他扩展上下文,如 service worker)。
   * 可选:消费者据此重建收藏库,实现跨上下文同步。返回取消订阅函数。
   */
  subscribe?(listener: () => void): () => void;
}

/** 领域操作失败码,UI 层据此给出中文提示。 */
export type DomainErrorCode =
  | "invalid-url"
  | "duplicate-url"
  | "bookmark-not-found"
  | "group-not-found"
  | "empty-group-name"
  | "empty-group-color"
  | "invalid-import"
  | "invalid-group-order"
  | "inbox-immutable";

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: DomainErrorCode };

/**
 * 持久化数据结构版本,随结构演进递增(导入导出的 JSON 备份依赖它)。
 * v5:canvasWidth 缺省转正为「自动撑满」档(拖柄调宽后钉住为固定值)。
 * v4:状态新增可选 canvasWidth(画布宽可调);v3 备份导入后补默认 1200。
 * v3:分组新增画布坐标 x/y(ADR-0004 白板自由定位);v2 及更早备份仍可导入。
 * v2:收藏新增可选 icon(data URL);v1 备份仍可导入。
 */
export const SCHEMA_VERSION = 5;

/** 画布上的落点(px,见 canvas.ts 与 GLOSSARY「画布」)。 */
export interface CanvasPos {
  x: number;
  y: number;
}

/** 可导入的备份 schemaVersion 下限(v1 起有 JSON 备份)。 */
export const MIN_IMPORT_SCHEMA_VERSION = 1;

/** 收集箱:保留分组,固定 id,永远存在、不可删除。 */
export const INBOX_GROUP_ID = "inbox";

/** 收集箱的显示名(状态中的分组名)。 */
export const INBOX_GROUP_NAME = "收集箱";

/** 收集箱的默认颜色(浅色蓝,深浅色下均可辨识)。 */
export const INBOX_GROUP_COLOR = "#3b82f6";

/**
 * 收集箱分组唯一构造:初始状态、损坏修复(补缺,order -1 排最前)、
 * 导入空态等全部引导处共用同一形状,不再各自手写字面量。
 * 落点缺省画布原点;补缺修复时由调用方传画布底部追加位。
 */
export function createInboxGroup(
  order: number,
  pos: CanvasPos = { x: 0, y: 0 }
): Group {
  return {
    id: INBOX_GROUP_ID,
    name: INBOX_GROUP_NAME,
    color: INBOX_GROUP_COLOR,
    order,
    x: pos.x,
    y: pos.y,
  };
}

/** 追加到末尾的下一个 order:空列表为 0,否则最大值 +1。 */
export function nextOrder(orders: number[]): number {
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** 按 order 升序的比较器:分组与收藏共用的排序形状。 */
export function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

/** 删除分组的返回:被删组 id 与回收入收集箱的收藏 id 列表。 */
export type DeleteGroupResult = Result<{
  groupId: GroupId;
  recycledIds: BookmarkId[];
}>;
