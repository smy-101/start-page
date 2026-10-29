import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BookmarkCard } from "./BookmarkCard";
import type { Bookmark, Group, Result } from "../domain/types";

/**
 * memo 契约(工单 10a / ADR-0002):BookmarkCard 自身的 React.memo 生效。
 * 观测缝 = 孙组件 Favicon 的计数包装:被测组件保持真实(memo 照常运行),
 * 仅当卡片真的重渲染时计数才增加 —— 去 React.memo 则红。
 * (App.render.test.tsx 的 vi.mock('./BookmarkCard') 只能钉住分区跳过渲染,
 * 钉不住卡片自身的 memo;分区级已由该文件覆盖,此处只补卡片级。)
 */

const mockFaviconRenders = { count: 0 };
vi.mock("./Favicon", async () => {
  const actual = await vi.importActual<typeof import("./Favicon")>("./Favicon");
  const Counted = (props: React.ComponentProps<typeof actual.Favicon>) => {
    mockFaviconRenders.count++;
    return <actual.Favicon {...props} />;
  };
  return { Favicon: Counted };
});

const group: Group = {
  id: "g1",
  name: "工作",
  color: "#0ea5e9",
  order: 1,
  x: 0,
  y: 0,
};
const groups: Group[] = [group];
const bookmark: Bookmark = {
  id: "b1",
  url: "https://work.example.com",
  title: "工件",
  note: "",
  groupId: "g1",
  order: 0,
};
const okBookmark: Result<Bookmark> = { ok: true, value: bookmark };
const noop = (): void => {};
// 稳定处理器(模块级引用):内联箭头会每渲染新建引用,击穿被测的 memo
const onEdit = async () => okBookmark;
const onDelete = async () => ({ ok: true as const, value: bookmark.id });

describe("memo 契约:BookmarkCard(真实组件)", () => {
  it("父级无关重渲染时卡片不重渲染", () => {
    function CardHarness() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN(n + 1)}>
            触发无关重渲染
          </button>
          <BookmarkCard
            whiteboardMode
            bookmark={bookmark}
            group={group}
            groups={groups}
            onEdit={onEdit}
            onDelete={onDelete}
            onDragStart={noop}
            onDragEnd={noop}
            onDragOver={noop}
            onDrop={noop}
          />
        </>
      );
    }
    render(<CardHarness />);
    expect(screen.getByText("工件")).toBeInTheDocument();
    const initial = mockFaviconRenders.count;
    expect(initial).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "触发无关重渲染" }));

    // memo 生效:卡片未重渲染,Favicon 计数不变
    expect(mockFaviconRenders.count).toBe(initial);
    expect(screen.getByText("工件")).toBeInTheDocument();
  });
});
