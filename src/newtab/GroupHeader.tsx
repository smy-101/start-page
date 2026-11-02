import { useState } from "react";
import { INBOX_GROUP_ID } from "../domain/store";
import { groupCellsOf } from "../domain/canvas";
import type { DeleteGroupResult, Group, Result } from "../domain/types";
import { ColorSwatches } from "./ColorSwatches";
import { domainErrorText } from "./messages";
import {
  ChevronDownIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  TrashIcon,
} from "./Icon";

type GroupHeaderProps = {
  group: Group;
  bookmarkCount: number;
  /** 折叠态(board-refresh/03):仅影响折叠钮指向与 aria-expanded */
  collapsed: boolean;
  /** 白板模式(board-whiteboard/03):分组操作出现;分组移动走画布 Pointer 拖拽 */
  whiteboardMode: boolean;
  onToggleCollapse(): void;
  onRename(name: string): Promise<Result<Group>>;
  onRecolor(color: string): Promise<Result<Group>>;
  /** 每行条数选择(group-width-tint):与改名/换色同表单提交 */
  onSetColumns(columns: number): Promise<Result<Group>>;
  /** 钉住/解除定长(group-height):组头切换定长 ↔ 自适应;计算与钳界在
   * GroupSection(复用其 measuredBaseOf/snapGrid,本组件只接事件) */
  onPinToggle(event: React.MouseEvent): void;
  onDeleteGroup(): Promise<DeleteGroupResult>;
};

/**
 * 分组列头:折叠钮/名字/计数;组色由托盘底染+边框承担(组头色点已退役);
 * 改名/换色/删除仅在白板模式出现
 * (board-whiteboard/03 门禁)。收集箱是保留分组,始终只读(可折叠)。
 * 组头不携带原生 DnD:分组移动由画布 Pointer 拖拽承担(ADR-0004,
 * 墙退役后仅收藏排序保留 HTML5 DnD)。
 */
export function GroupHeader({
  group,
  bookmarkCount,
  collapsed,
  whiteboardMode,
  onToggleCollapse,
  onRename,
  onRecolor,
  onSetColumns,
  onPinToggle,
  onDeleteGroup,
}: GroupHeaderProps) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  // 每行条数(group-width-free):生效值含装满缺省(columns 缺省 = 随组宽)
  const [columns, setColumns] = useState(groupCellsOf(group));
  const [error, setError] = useState<string | null>(null);
  const isInbox = group.id === INBOX_GROUP_ID;

  function startEdit() {
    setName(group.name);
    setColor(group.color);
    setColumns(groupCellsOf(group));
    setError(null);
    setMode("edit");
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    // 只提交有变化的字段
    const renamed =
      name.trim() !== group.name
        ? await onRename(name)
        : { ok: true as const, value: group };
    if (!renamed.ok) {
      setError(domainErrorText[renamed.error]);
      return;
    }
    if (color !== group.color) {
      const recolored = await onRecolor(color);
      if (!recolored.ok) {
        setError(domainErrorText[recolored.error]);
        return;
      }
    }
    if (columns !== groupCellsOf(group)) {
      const resized = await onSetColumns(columns);
      if (!resized.ok) {
        setError(domainErrorText[resized.error]);
        return;
      }
    }
    setError(null);
    setMode("view");
  }

  async function handleDelete() {
    const result = await onDeleteGroup();
    if (!result.ok) setError(domainErrorText[result.error]);
  }

  return (
    <div className="group-header">
      {mode === "edit" && !isInbox ? (
        <form className="group-edit-form" onSubmit={handleSave}>
          <label htmlFor={`group-name-${group.id}`}>分组名</label>
          <input
            id={`group-name-${group.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
          <ColorSwatches
            name={`group-color-${group.id}`}
            value={color}
            onChange={setColor}
          />
          <label htmlFor={`group-columns-${group.id}`}>每行条数</label>
          <select
            id={`group-columns-${group.id}`}
            value={columns}
            onChange={(e) => setColumns(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                一行 {n} 条
              </option>
            ))}
          </select>
          <div className="card-actions">
            <button type="submit">保存</button>
            <button type="button" onClick={() => setMode("view")}>
              取消
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      ) : mode === "delete" && !isInbox ? (
        <div className="group-delete-confirm">
          <p className="group-delete-warning">
            {bookmarkCount > 0
              ? `删除分组「${group.name}」?组内 ${bookmarkCount} 条收藏将全部移入收集箱,不会被删除。`
              : `删除分组「${group.name}」?该分组将被删除。`}
          </p>
          <div className="card-actions">
            <button type="button" onClick={handleDelete}>
              确认删除
            </button>
            <button type="button" onClick={() => setMode("view")}>
              取消
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <>
          <button
            type="button"
            className="collapse-toggle icon-button"
            aria-expanded={!collapsed}
            aria-label={
              collapsed ? `展开分组 ${group.name}` : `折叠分组 ${group.name}`
            }
            title={
              collapsed ? `展开分组 ${group.name}` : `折叠分组 ${group.name}`
            }
            onClick={onToggleCollapse}
          >
            <ChevronDownIcon size={12} />
          </button>
          <h2 className="group-name">{group.name}</h2>
          <span className="group-count">{bookmarkCount}</span>
          {/* 钉住/解除定长(group-height):仅白板模式且非折叠——折叠时实测高
              只剩组头(钳落下界 176),「以实测高钉住」失义,与底柄同门禁隐藏;
              收集箱同样适用(高度是排版旋钮非内容编辑,同折叠/调宽同权) */}
          {whiteboardMode && !collapsed && (
            <button
              type="button"
              className="icon-button group-pin"
              aria-label={
                group.height !== undefined
                  ? `解除分组 ${group.name} 定长,回到自适应`
                  : `钉住分组 ${group.name} 高度为定长`
              }
              aria-pressed={group.height !== undefined}
              title={
                group.height !== undefined
                  ? "解除定长(回自适应)"
                  : "钉住高度(定长)"
              }
              onClick={onPinToggle}
            >
              {group.height !== undefined ? (
                <PinOffIcon size={14} />
              ) : (
                <PinIcon size={14} />
              )}
            </button>
          )}
          {!isInbox && whiteboardMode && (
            <span className="group-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={`编辑分组 ${group.name}`}
                title={`编辑分组 ${group.name}`}
                onClick={startEdit}
              >
                <PencilIcon size={14} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`删除分组 ${group.name}`}
                title={`删除分组 ${group.name}`}
                onClick={() => setMode("delete")}
              >
                <TrashIcon size={14} />
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}
