import { describe, expect, it } from "vitest";
import { INBOX_GROUP_ID } from "../domain/store";
import type { Group } from "../domain/types";
import {
  SAVE_TO_ROOT_ID,
  UNFAVORITE_ID,
  buildContextMenuItems,
  groupMenuItemId,
  parseGroupMenuItemId,
} from "./menuSpecs";

/** 菜单结构说明(纯数据):分组如何变成「收藏到 →」子菜单 + 「取消收藏」根项。 */
function groups(): Group[] {
  return [
    {
      id: INBOX_GROUP_ID,
      name: "收集箱",
      color: "#3b82f6",
      order: 0,
      x: 0,
      y: 0,
    },
    { id: "g-work", name: "工作", color: "#e99695", order: 2, x: 0, y: 0 },
    { id: "g-news", name: "资讯", color: "#67c23a", order: 1, x: 0, y: 0 },
  ];
}

describe("右键菜单项构建 buildContextMenuItems", () => {
  it("根「收藏到」+ 按分组顺序的子菜单;子项 id 确定且可反解出 groupId", () => {
    const items = buildContextMenuItems(groups());

    expect(items[0]).toMatchObject({ id: SAVE_TO_ROOT_ID, title: "收藏到" });
    const children = items.filter((i) => i.parentId === SAVE_TO_ROOT_ID);
    expect(children.map((i) => i.title)).toEqual(["收集箱", "资讯", "工作"]);
    for (const group of groups()) {
      const id = groupMenuItemId(group.id);
      expect(children.some((i) => i.id === id && i.title === group.name)).toBe(
        true
      );
      expect(parseGroupMenuItemId(id)).toBe(group.id);
    }
  });

  it("每个菜单项都限定普通网页(contexts page + http(s) documentUrlPatterns),chrome:// 等特殊页不出现", () => {
    const items = buildContextMenuItems(groups());

    expect(items).not.toHaveLength(0);
    for (const item of items) {
      expect(item.contexts).toEqual(["page"]);
      expect(item.documentUrlPatterns).toEqual(["http://*/*", "https://*/*"]);
    }
    expect(parseGroupMenuItemId(SAVE_TO_ROOT_ID)).toBeNull();
  });

  it("「取消收藏」为独立根项,创建时不可见(可见性随当前页是否已收藏切换)", () => {
    const items = buildContextMenuItems(groups());

    const unfavorite = items.find((i) => i.id === UNFAVORITE_ID);
    expect(unfavorite).toMatchObject({ title: "取消收藏", visible: false });
    expect(unfavorite?.parentId).toBeUndefined();
  });
});
