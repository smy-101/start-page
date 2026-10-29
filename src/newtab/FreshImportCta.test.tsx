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
import type { NativeBookmarkNode } from "../domain/nativeImport";

beforeEach(() => {
  localStorage.clear();
});

const FAKE_TREE: NativeBookmarkNode[] = [
  {
    id: "0",
    title: "",
    children: [
      {
        id: "1",
        title: "书签栏",
        children: [
          { id: "2", title: "工作站", url: "https://work.example.com" },
        ],
      },
    ],
  },
];

function freshStorage() {
  return createMemoryStorage({
    schemaVersion: SCHEMA_VERSION,
    groups: [
      { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
    ],
    bookmarks: [],
  });
}

describe("全新安装引导(board-refresh/06)", () => {
  it("fresh 态看板上方显示导入引导;手动添加钮打开弹窗", async () => {
    render(<App adapter={freshStorage()} />);

    await screen.findByRole("region", { name: "初始化引导" });
    expect(
      screen.getByRole("button", { name: "从浏览器书签导入" })
    ).toBeInTheDocument();
    // 看板仍在(收集箱空列可见),编辑/建组路径不被堵死
    expect(document.querySelector(".groups-wall")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "手动添加收藏" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("一键导入:走原生书签管线,导入后引导消失、看板出现", async () => {
    const adapter = freshStorage();
    render(<App adapter={adapter} getBookmarkTree={async () => FAKE_TREE} />);

    await screen.findByRole("region", { name: "初始化引导" });
    fireEvent.click(screen.getByRole("button", { name: "从浏览器书签导入" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/新增 1 条/)
    );
    // 文件夹「书签栏」成组,组内出现「工作站」收藏
    const bar = await screen.findByRole("region", { name: "书签栏" });
    expect(
      within(bar).getByRole("link", { name: /工作站/ })
    ).toBeInTheDocument();
    expect(document.querySelector(".fresh-cta")).toBeNull();
    const saved = await adapter.load();
    expect(saved?.bookmarks).toHaveLength(1);
  });

  it("非 fresh 态不显示引导", async () => {
    render(
      <App
        adapter={createMemoryStorage({
          schemaVersion: SCHEMA_VERSION,
          groups: [
            { id: INBOX_GROUP_ID, name: "收集箱", color: "#3b82f6", order: 0 },
          ],
          bookmarks: [
            {
              id: "b1",
              url: "https://a.example.com",
              title: "A",
              note: "",
              groupId: INBOX_GROUP_ID,
              order: 0,
            },
          ],
        })}
      />
    );
    await screen.findByRole("listitem");

    expect(document.querySelector(".fresh-cta")).toBeNull();
    expect(document.querySelector(".groups-wall")).not.toBeNull();
  });

  it("导入空书签树:提示无书签,引导保留", async () => {
    render(
      <App
        adapter={freshStorage()}
        getBookmarkTree={async () => [
          {
            id: "0",
            title: "",
            children: [{ id: "1", title: "空栏", children: [] }],
          },
        ]}
      />
    );
    await screen.findByRole("region", { name: "初始化引导" });
    fireEvent.click(screen.getByRole("button", { name: "从浏览器书签导入" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("浏览器书签为空")
    );
    expect(document.querySelector(".fresh-cta")).not.toBeNull();
  });
});
