import { fireEvent, screen } from "@testing-library/react";

/**
 * 测试共享操作(board-whiteboard/03):进入白板模式(原编辑模式更名)。
 * 行的编辑/删除与拖拽、分组列头操作仅在此模式出现;
 * 此刻页面上唯一的「进入白板」按钮是头部开关(行按钮尚未渲染,无歧义;
 * nudge 在屏时改用 within(nudge) 限定,见 queryNudge)。
 */
export function enterWhiteboardMode(): void {
  fireEvent.click(screen.getByRole("button", { name: "进入白板" }));
}

/**
 * 返回初始页并等到视图就绪(ui 移除标题后,「进入白板」开关是
 * 初始页视图的标志);返回该按钮例试用例继续断言。
 */
export async function backToStartView(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "返回初始页" }));
  return await screen.findByRole("button", { name: "进入白板" });
}

/** 带 Pointer props 的合成事件(jsdom 30 有 PointerEvent 构造器)。 */
export function pointerEvent(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  opts: { clientX?: number; clientY?: number; button?: number } = {}
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...opts,
  });
}

/** 白板 nudge 引导浮层(仅拖动意图触发时存在;不存在时为 null)。 */
export function queryNudge(): HTMLElement | null {
  return document.querySelector(".whiteboard-nudge");
}
