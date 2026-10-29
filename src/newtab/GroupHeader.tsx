import { useState } from "react";
import { INBOX_GROUP_ID } from "../domain/store";
import type { DeleteGroupResult, Group, Result } from "../domain/types";
import { ColorSwatches } from "./ColorSwatches";
import { domainErrorText } from "./messages";

type GroupHeaderProps = {
  group: Group;
  bookmarkCount: number;
  /** 编辑模式(ui-refresh/04):展示分组操作并允许拖拽换位;平时列头只读 */
  editMode: boolean;
  onRename(name: string): Promise<Result<Group>>;
  onRecolor(color: string): Promise<Result<Group>>;
  onDeleteGroup(): Promise<DeleteGroupResult>;
  /** 组间拖拽排序:表头作为拖拽源(放置目标由所在分区承担)。 */
  onDragStart(): void;
  onDragEnd(): void;
};

/**
 * 分组列头:色点/名字/计数;改名/换色/删除仅在编辑模式出现(ui-refresh/04)。
 * 收集箱是保留分组,始终只读。
 */
export function GroupHeader({
  group,
  bookmarkCount,
  editMode,
  onRename,
  onRecolor,
  onDeleteGroup,
  onDragStart,
  onDragEnd,
}: GroupHeaderProps) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const [error, setError] = useState<string | null>(null);
  const isInbox = group.id === INBOX_GROUP_ID;

  function startEdit() {
    setName(group.name);
    setColor(group.color);
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
    setError(null);
    setMode("view");
  }

  async function handleDelete() {
    const result = await onDeleteGroup();
    if (!result.ok) setError(domainErrorText[result.error]);
  }

  return (
    <div
      className="group-header"
      // 拖拽换位是整理动作:仅编辑模式可拖(ui-refresh/04)
      draggable={editMode && mode === "view"}
      onDragStart={() => onDragStart()}
      onDragEnd={onDragEnd}
    >
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
          <span
            className="group-color-dot"
            style={{ backgroundColor: group.color }}
          />
          <h2 className="group-name">{group.name}</h2>
          <span className="group-count">{bookmarkCount}</span>
          {!isInbox && editMode && (
            <span className="group-actions">
              <button
                type="button"
                aria-label={`编辑分组 ${group.name}`}
                onClick={startEdit}
              >
                编辑
              </button>
              <button
                type="button"
                aria-label={`删除分组 ${group.name}`}
                onClick={() => setMode("delete")}
              >
                删除
              </button>
            </span>
          )}
        </>
      )}
    </div>
  );
}
