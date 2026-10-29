import { useState } from "react";
import type { Bookmark, Group, Result } from "../domain/types";
import type { NewBookmarkInput, NewGroupInput } from "../domain/store";
import { AddBookmarkForm } from "./AddBookmarkForm";
import { NewGroupForm } from "./NewGroupForm";
import { XIcon } from "./Icon";

type AddDialogProps = {
  /** 全部分组(按 order 排序,含收集箱):添加收藏选分组候选 */
  groups: Group[];
  onClose(): void;
  onAdd: (input: NewBookmarkInput) => Promise<Result<Bookmark>>;
  onCreateGroup: (input: NewGroupInput) => Promise<Result<Group>>;
};

type AddTab = "bookmark" | "group";

const TABS: { id: AddTab; label: string }[] = [
  { id: "bookmark", label: "添加收藏" },
  { id: "group", label: "新建分组" },
];

/**
 * 添加弹窗(ui-refresh/02):页签切换「添加收藏 / 新建分组」,
 * 任一表单提交成功即整体关闭;Esc / 遮罩点击 / × 均可关闭。
 */
export function AddDialog({
  groups,
  onClose,
  onAdd,
  onCreateGroup,
}: AddDialogProps) {
  const [tab, setTab] = useState<AddTab>("bookmark");

  async function handleCreateGroup(
    input: NewGroupInput
  ): Promise<Result<Group>> {
    const result = await onCreateGroup(input);
    if (result.ok) onClose();
    return result;
  }

  return (
    <div
      className="dialog-overlay"
      // 只点遮罩自身关闭;弹窗内容点击冒泡到此但 target 不是 overlay,不关
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="添加收藏或分组"
      >
        <div className="dialog-tabs" role="tablist" aria-label="添加类型">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className="dialog-tab"
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="dialog-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <XIcon size={16} />
          </button>
        </div>
        {tab === "bookmark" ? (
          <AddBookmarkForm groups={groups} onAdd={onAdd} onAdded={onClose} />
        ) : (
          <NewGroupForm onCreate={handleCreateGroup} />
        )}
      </div>
    </div>
  );
}
