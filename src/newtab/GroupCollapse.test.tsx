import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

function seededState(): BookmarkState {
  return {
    schemaVersion: SCHEMA_VERSION,
    groups: [
      {
        id: INBOX_GROUP_ID,
        name: "收集箱",
        color: "#3b82f6",
        order: 0,
        x: 0,
        y: 0,
      },
      { id: "g-work", name: "工作", color: "#e99695", order: 1, x: 0, y: 0 },
    ],
    bookmarks: [
      {
        id: "b-inbox",
        url: "https://inbox.example.com",
        title: "收件",
        note: "",
        groupId: INBOX_GROUP_ID,
        order: 0,
      },
      {
        id: "b-w1",
        url: "https://work.example.com",
        title: "工作一",
        note: "",
        groupId: "g-work",
        order: 0,
      },
    ],
  };
}

async function renderSeeded() {
  render(<App adapter={createMemoryStorage(seededState())} />);
  await screen.findByRole("region", { name: "工作" });
}

beforeEach(() => {
  localStorage.clear();
});

describe("分组折叠(board-refresh/03)", () => {
  it("默认全部展开;折叠后组内 DOM 卸载、aria 收紧,再展开恢复", async () => {
    await renderSeeded();

    const work = screen.getByRole("region", { name: "工作" });
    expect(within(work).getAllByRole("listitem")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "折叠分组 工作" })
    ).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "折叠分组 工作" }));

    expect(within(work).queryAllByRole("listitem")).toHaveLength(0);
    expect(work).toHaveAttribute("data-collapsed", "true");
    expect(
      screen.getByRole("button", { name: "展开分组 工作" })
    ).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "展开分组 工作" }));
    expect(within(work).getAllByRole("listitem")).toHaveLength(1);
    expect(work).not.toHaveAttribute("data-collapsed");
  });

  it("收集箱只读但同样可折叠", async () => {
    await renderSeeded();

    fireEvent.click(screen.getByRole("button", { name: "折叠分组 收集箱" }));

    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(within(inbox).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("折叠集持久化到 localStorage,重新挂载保持折叠", async () => {
    await renderSeeded();
    fireEvent.click(screen.getByRole("button", { name: "折叠分组 工作" }));

    expect(localStorage.getItem("start-page.collapsed-groups")).toBe(
      JSON.stringify(["g-work"])
    );

    // 重新挂载(模拟刷新):折叠状态从 localStorage 恢复
    render(<App adapter={createMemoryStorage(seededState())} />);
    await waitFor(() =>
      expect(screen.getAllByRole("region", { name: "工作" })).toHaveLength(2)
    );
    const work2 = screen.getAllByRole("region", { name: "工作" })[1];
    expect(work2).toHaveAttribute("data-collapsed", "true");
    expect(
      within(work2).getByRole("button", { name: "展开分组 工作" })
    ).toBeInTheDocument();
  });

  it("底缘组折叠/展开:画布高同帧随组高收缩,不闪旧边界(collapse-canvas-sync)", async () => {
    // 桩量高(jsdom 几何全 0,同步量高腿需可读数):组托盘展开 200、折叠 56;
    // 其余元素走 jsdom 原值
    const desc = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )!;
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.classList.contains("group"))
          return desc.get!.call(this) as number;
        return this.dataset.collapsed === "true" ? 56 : 200;
      },
    });
    try {
      const state = seededState();
      state.groups[1].y = 400; // 工作组沉到底缘
      render(<App adapter={createMemoryStorage(state)} />);
      await screen.findByRole("region", { name: "工作" });

      const canvas = document.querySelector(
        ".whiteboard-canvas"
      ) as HTMLElement;
      // 展开态画布高 = 底缘组 400 + 200 + 底衬 24
      expect(canvas.style.minHeight).toBe("624px");

      fireEvent.click(screen.getByRole("button", { name: "折叠分组 工作" }));
      // RO 缺席也要当帧收缩:400 + 56 + 24——旧实现停在 624,
      // 底缘会闪一帧旧高露出画布边界(实测 canvas-bounds 闪烁复现机制)
      expect(canvas.style.minHeight).toBe("480px");

      fireEvent.click(screen.getByRole("button", { name: "展开分组 工作" }));
      expect(canvas.style.minHeight).toBe("624px");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", desc);
    }
  });

  it("搜索时忽略折叠:命中项照常展示", async () => {
    await renderSeeded();
    fireEvent.click(screen.getByRole("button", { name: "折叠分组 工作" }));

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索收藏" }), {
      target: { value: "工作一" },
    });

    const work = await screen.getAllByRole("region", { name: "工作" })[0];
    await within(work).findByText("工作一");
    // 搜索词清空后折叠恢复生效
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索收藏" }), {
      target: { value: "" },
    });
    await waitFor(() => expect(work).toHaveAttribute("data-collapsed", "true"));
  });

  it("删除分组后折叠集同步剔除,不残留", async () => {
    render(
      <App
        adapter={createMemoryStorage({
          schemaVersion: SCHEMA_VERSION,
          groups: [
            {
              id: INBOX_GROUP_ID,
              name: "收集箱",
              color: "#3b82f6",
              order: 0,
              x: 0,
              y: 0,
            },
            {
              id: "g-work",
              name: "工作",
              color: "#e99695",
              order: 1,
              x: 0,
              y: 0,
            },
          ],
          bookmarks: [],
        })}
      />
    );
    await screen.findByRole("region", { name: "工作" });

    fireEvent.click(screen.getByRole("button", { name: "折叠分组 工作" }));
    fireEvent.click(screen.getByRole("button", { name: "进入白板" }));
    fireEvent.click(screen.getByRole("button", { name: "删除分组 工作" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(localStorage.getItem("start-page.collapsed-groups")).toBe(
        JSON.stringify([])
      )
    );
  });
});
