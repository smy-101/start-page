/** 收藏:一条被保存的网页记录,必属且仅属一个分组(见 GLOSSARY.md)。 */
export type BookmarkId = string;
export type GroupId = string;
/** 待办卡/待办条目 id(ADR-0006:画布第二种卡片)。 */
export type TodoId = string;

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
  /**
   * 每行条数(schema v6,group-width-tint):组内一行摆几条收藏(1–6),
   * 缺省 = 装满(随组宽档位,schema v7);恒 ≤ 档位(写路径保证)。
   */
  columns?: number;
  /**
   * 组宽档位(schema v7,group-span-decouple):组宽 = groupWidthOf(档位),
   * 不存 px;缺省 = 从每行条数推导(装满,v6 存量零改写迁移)。
   * 与每行条数解耦:拖柄只改档位,表单只改每行条数且永不缩宽。
   */
  span?: number;
  /**
   * 组定长高(px,schema v12,group-height):缺省 = undefined 自适应
   * (现行观感:网格 max-height clamp 内部滚动,存量零改写);白板模式
   * 拖组底缘连续调高(松手 16px 网格吸附)或键盘 ↑/↓ 步进、组头钉住钮
   * 切换定长 ↔ 自适应;钳 [176, 720];定长时卡面纵向 flex、组头常驻、
   * 网格区滚动。不随画布宽收窄(高不参与横向几何,画布向下无界)。
   */
  height?: number;
}

/** 待办条目(ADR-0006):勾选框 + 文本,必属且仅属一张待办卡(嵌在卡内,自包含)。 */
export interface TodoItem {
  id: TodoId;
  /** 修剪后的非空文本(写路径保证,空文本拒收) */
  text: string;
  /** 完成态:完成项划线沉卡底(toggle 是唯一沉底执行者,手工排序自由) */
  done: boolean;
  /** 卡内顺序,0..n−1;沉底/回升/排序时重排 */
  order: number;
}

/**
 * 待办卡(ADR-0006):画布上与分组卡并排的清单卡;不装收藏、不是分组。
 * 宽为自由宽(缺省 CARD_W,schema v10),x/y 与分组同语义;
 * 删除不进收集箱;缺省中性配色,可选卡色底染(todo-card-size-color)。
 */
export interface TodoCard {
  id: TodoId;
  /** 缺省「待办」;改名空文本回退缺省(inline 快改,不报错) */
  title: string;
  /** 条目嵌在卡内;顺序即 items 各自 order 排序后的稳定序 */
  items: TodoItem[];
  /** DOM/Tab 序(画布布局由 x/y 承担,同分组 order 的角色) */
  order: number;
  /** 画布横坐标(px):与分组同语义 */
  x: number;
  /** 画布纵坐标(px):画布向下无界 */
  y: number;
  /**
   * 待办卡宽(px,schema v10,todo-card-size-color 自由宽):缺省 = CARD_W;
   * 白板模式拖右缘连续调宽(松手 16px 网格吸附)或键盘 ←/→ 步进一格;
   * 钳 [240, 768],缩画布宽至放不下时收窄。
   * (v9 的档位制 span 未发布即被自由宽取代,迁移按旧档位数学换算。)
   */
  width?: number;
  /**
   * 待办卡定长高(px,schema v11,todo-height-archive):缺省 = undefined
   * 自适应(内容随长,列表约 18 行起内部滚动;存量零改写);白板模式
   * 拖卡底缘连续调高(松手 16px 网格吸附)或键盘 ↑/↓ 步进一格;
   * 钳 [176, 720];定长时卡面纵向 flex、条目列表区滚动、添加行常驻。
   * 不随画布宽收窄(高不参与横向几何,画布向下无界)。
   */
  height?: number;
  /**
   * 待办卡卡色(schema v9,todo-card-size-color):缺省 = 中性白卡;
   * 白板模式卡头色板选择;写路径空串复位中性(剥离字段)。
   * 随 JSON 备份导入导出(ADR-0006 补记:推翻 v1「不做自选色」)。
   */
  color?: string;
}

/** 单一状态对象,整体持久化到 chrome.storage.local。 */
export interface BookmarkState {
  schemaVersion: number;
  groups: Group[];
  bookmarks: Bookmark[];
  /**
   * 待办卡列表(schema v8,todo-card):可选是存量夹具兼容(迁移补缺省 []);
   * store 引导后恒为数组,UI 消费处 `?? []` 兑底。
   */
  todos?: TodoCard[];
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
  | "inbox-immutable"
  | "todo-not-found"
  | "todo-item-not-found"
  | "empty-todo-text"
  | "invalid-todo-order";

export type Result<T> =
  { ok: true; value: T } | { ok: false; error: DomainErrorCode };

/**
 * 持久化数据结构版本,随结构演进递增(导入导出的 JSON 备份依赖它)。
 * v11:待办卡新增可选 height(定长高 px,缺省 = undefined 自适应;
 * todo-height-archive);v10 及更早备份零改写迁移(缺省即自适应)。
 * v12:分组新增可选 height(组定长高 px,缺省 = undefined 自适应;
 * group-height,与待办卡定长高对称);v11 及更早备份零改写迁移
 * (缺省即自适应)。
 * v10:待办卡 span(宽档位)改为 width(自由宽 px,缺省 CARD_W,钳
 * [240, 768];todo-card-size-color 调校);v9 备份按旧档位数学换算为 px,
 * 渲染宽不变(v9 未发布,仅本地开发版数据走此换算)。
 * v9:待办卡新增可选 span(待办卡宽档位)与 color(卡色,缺省中性;
 * todo-card-size-color);v8 及更早备份零改写迁移(缺省档位 1 = CARD_W)。
 * v8:状态新增可选 todos(待办卡,ADR-0006;todo-card);v7 及更早备份缺省
 * 补空数组(零改写迁移),不预置示例卡。
 * v7:分组新增可选 span(组宽档位,与每行条数解耦;group-span-decouple);
 * v6 数据零改写迁移(缺省档位从 columns 推导)。
 * v6:分组新增可选 columns(每行条数;group-width-tint)。
 * v5:canvasWidth 缺省转正为「自动撑满」档(拖柄调宽后钉住为固定值)。
 * v4:状态新增可选 canvasWidth(画布宽可调);v3 备份导入后补默认 1200。
 * v3:分组新增画布坐标 x/y(ADR-0004 白板自由定位);v2 及更早备份仍可导入。
 * v2:收藏新增可选 icon(data URL);v1 备份仍可导入。
 */
export const SCHEMA_VERSION = 12;

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

/** 待办卡缺省标题(ADR-0006):新建缺省、改名空文本回退。 */
export const DEFAULT_TODO_TITLE = "待办";

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
