import { fireEvent, screen } from "@testing-library/react";

/**
 * 测试共享操作(ui-refresh/04):进入编辑模式。
 * 行的编辑/删除与拖拽、分组列头操作仅在此模式出现;
 * 此刻页面上唯一的「编辑」按钮是头部开关(行按钮尚未渲染,无歧义)。
 */
export function enterEditMode(): void {
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
}
