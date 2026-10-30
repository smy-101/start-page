import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { enterWhiteboardMode } from "./testUtils";
import { createMemoryStorage } from "../storage/memoryStorage";
import { INBOX_GROUP_ID, SCHEMA_VERSION } from "../domain/store";
import type { BookmarkState } from "../domain/types";

async function renderApp() {
  render(<App adapter={createMemoryStorage()} />);
  await screen.findByRole("heading", { name: "收集箱" });
}

describe("分组管理:新建分组", () => {
  it("填名字选颜色提交后,新分组分区出现;空名被拒并给出中文提示", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.change(within(dialog).getByLabelText("分组名"), {
      target: { value: "工作" },
    });
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "颜色 #e99695" })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));

    expect(
      await screen.findByRole("heading", { name: "工作" })
    ).toBeInTheDocument();

    // 空名:重开弹窗提交,错误就地展示在弹窗内
    fireEvent.click(screen.getByRole("button", { name: "添加收藏或分组" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("tab", { name: "新建分组" }));
    fireEvent.change(within(dialog).getByLabelText("分组名"), {
      target: { value: "   " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "新建分组" }));
    expect(
      await within(dialog).findByText("分组名不能为空")
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
  });
});

/** 预置状态:收集箱 1 条 + 工作 2 条,直接注入适配器。 */
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
        url: "https://w1.example.com",
        title: "工作一",
        note: "",
        groupId: "g-work",
        order: 0,
      },
      {
        id: "b-w2",
        url: "https://w2.example.com",
        title: "工作二",
        note: "",
        groupId: "g-work",
        order: 1,
      },
    ],
  };
}

async function renderSeeded() {
  render(<App adapter={createMemoryStorage(seededState())} />);
  await screen.findByRole("region", { name: "工作" });
  return {
    inbox: screen.getByRole("region", { name: "收集箱" }),
    work: screen.getByRole("region", { name: "工作" }),
  };
}

describe("分组管理:重命名与换色", () => {
  it("内联编辑:改名与换色保存后即时生效", async () => {
    const { work } = await renderSeeded();
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    );
    fireEvent.change(within(work).getByLabelText("分组名"), {
      target: { value: "办公" },
    });
    fireEvent.click(within(work).getByRole("radio", { name: "颜色 #9fe295" }));
    fireEvent.click(within(work).getByRole("button", { name: "保存" }));

    const renamed = await screen.findByRole("region", { name: "办公" });
    expect(screen.queryByRole("region", { name: "工作" })).toBeNull();
    // 组头色点已退役,换色经托盘底染的 --group-color 变量生效
    expect(renamed.style.getPropertyValue("--group-color")).toBe("#9fe295");
  });

  it("收集箱列头始终只读:编辑模式下也不提供改名/换色/删除入口", async () => {
    const { inbox } = await renderSeeded();
    enterWhiteboardMode();

    expect(
      within(inbox).queryByRole("button", { name: /^编辑分组/ })
    ).toBeNull();
    expect(
      within(inbox).queryByRole("button", { name: /^删除分组/ })
    ).toBeNull();
  });
});

describe("分组管理:删除分组回收", () => {
  it("删除前给出回收警告,确认后组内收藏全部回到收集箱", async () => {
    const { work } = await renderSeeded();
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "删除分组 工作" })
    );

    expect(
      screen.getByText(
        "删除分组「工作」?组内 2 条收藏将全部移入收集箱,不会被删除。"
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(await screen.findByText(/已移入收集箱/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "工作" })).toBeNull();
    const inbox = screen.getByRole("region", { name: "收集箱" });
    expect(within(inbox).getAllByRole("listitem")).toHaveLength(3);
    expect(within(inbox).getByText("工作一")).toBeInTheDocument();
    expect(within(inbox).getByText("工作二")).toBeInTheDocument();
  });

  it("取消删除则分组与收藏原封不动", async () => {
    const { work } = await renderSeeded();
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "删除分组 工作" })
    );
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByRole("region", { name: "工作" })).toBeInTheDocument();
    expect(within(work).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("分组管理:拖拽(组内排序与跨组移动)", () => {
  it("组间换位 DnD 已随墙退役:组头拖不起,drop 不换位", async () => {
    await renderSeeded();
    expect(sectionNames()).toEqual(["收集箱", "工作"]);

    const work = screen.getByRole("region", { name: "工作" });
    expect(
      fireEvent.dragStart(within(work).getByRole("heading", { name: "工作" }))
    ).toBe(false);
    fireEvent.drop(screen.getByRole("region", { name: "收集箱" }));

    // order 不变:分组移动只走白板 Pointer 拖拽(写 x/y,不改 order)
    expect(sectionNames()).toEqual(["收集箱", "工作"]);
  });

  it("组内排序:把第二张收藏拖到第一张之前", async () => {
    const { work } = await renderSeeded();
    expect(cardTitles(work)).toEqual(["工作一", "工作二"]);

    fireEvent.dragStart(within(work).getAllByRole("listitem")[1]);
    fireEvent.dragOver(within(work).getAllByRole("listitem")[0]);
    fireEvent.drop(within(work).getAllByRole("listitem")[0]);

    await waitFor(() => expect(cardTitles(work)).toEqual(["工作二", "工作一"]));
  });

  it("跨组移动:把工作收藏拖到收集箱分区,追加到收集箱末尾", async () => {
    const { work } = await renderSeeded();

    fireEvent.dragStart(within(work).getAllByRole("listitem")[0]);
    fireEvent.drop(screen.getByRole("region", { name: "收集箱" }));

    await waitFor(() => {
      expect(
        cardTitles(screen.getByRole("region", { name: "收集箱" }))
      ).toEqual(["收件", "工作一"]);
    });
    expect(cardTitles(screen.getByRole("region", { name: "工作" }))).toEqual([
      "工作二",
    ]);
  });

  it("跨组移动到指定位置:把收集箱收藏拖到工作的第二张之前", async () => {
    await renderSeeded();
    const inbox = screen.getByRole("region", { name: "收集箱" });
    const work = screen.getByRole("region", { name: "工作" });

    fireEvent.dragStart(within(inbox).getAllByRole("listitem")[0]);
    fireEvent.drop(within(work).getAllByRole("listitem")[1]);

    await waitFor(() =>
      expect(cardTitles(work)).toEqual(["工作一", "收件", "工作二"])
    );
    expect(cardTitles(inbox)).toEqual([]);
  });

  it("未拖拽时放置不产生任何变化", async () => {
    const { work, inbox } = await renderSeeded();

    fireEvent.drop(inbox);
    fireEvent.drop(within(work).getAllByRole("listitem")[0]);

    expect(sectionNames()).toEqual(["收集箱", "工作"]);
    expect(cardTitles(work)).toEqual(["工作一", "工作二"]);
    expect(cardTitles(inbox)).toEqual(["收件"]);
  });
});

/** 页面上分组分区的顺序,即组间排序结果(设置区的导入导出也是 region,按 .group 过滤)。 */
function sectionNames(): string[] {
  return screen
    .getAllByRole("region")
    .filter((el) => el.classList.contains("group"))
    .map((el) => el.getAttribute("aria-label") ?? "");
}

/** 某分组内卡片标题的渲染顺序(空组返回空列表)。 */
function cardTitles(section: HTMLElement): string[] {
  return within(section)
    .queryAllByRole("listitem")
    .map((card) => card.querySelector(".card-title")?.textContent ?? "");
}

describe("分组管理:每行条数(group-width-tint)", () => {
  it("组头编辑表单选每行条数,保存后组宽随列数推导", async () => {
    const { work } = await renderSeeded();
    enterWhiteboardMode();

    expect(parseFloat(work.style.width)).toBeCloseTo((1200 - 16 * 2) / 3, 5);

    fireEvent.click(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    );
    fireEvent.change(within(work).getByLabelText("每行条数"), {
      target: { value: "3" },
    });
    fireEvent.click(within(work).getByRole("button", { name: "保存" }));

    // W(3)=602:38 + 3×184 + 2×6
    await waitFor(() => expect(parseFloat(work.style.width)).toBe(602));
  });

  it("收集箱表单不出现:无改名/换色入口,每行条数同样只读", async () => {
    const { inbox } = await renderSeeded();
    enterWhiteboardMode();

    expect(within(inbox).queryByLabelText("每行条数")).toBeNull();
  });
});

describe("组宽档位:表单改每行条数不缩宽(group-span-decouple)", () => {
  /** 预置工作组带档位字段(拖宽等效);g-work 由 overrides 覆盖。 */
  async function renderSpanned(overrides: { span?: number; columns?: number }) {
    const state = seededState();
    state.groups = state.groups.map((g) =>
      g.id === "g-work" ? { ...g, ...overrides } : g
    );
    render(<App adapter={createMemoryStorage(state)} />);
    await screen.findByRole("region", { name: "工作" });
    return screen.getByRole("region", { name: "工作" });
  }

  function gridTemplate(work: HTMLElement): string {
    return (work.querySelector(".group-grid") as HTMLElement).style
      .gridTemplateColumns;
  }

  it("拖宽(span 4)后表单改一行 1 条:组宽保持 792,网格单列拉满整行", async () => {
    const work = await renderSpanned({ span: 4 });
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    );
    fireEvent.change(within(work).getByLabelText("每行条数"), {
      target: { value: "1" },
    });
    fireEvent.click(within(work).getByRole("button", { name: "保存" }));

    // W(4)=792 组宽不缩(用户诉求);清单式网格 repeat(1)
    await waitFor(() =>
      expect(gridTemplate(work)).toBe("repeat(1, minmax(184px, 1fr))")
    );
    expect(parseFloat(work.style.width)).toBe(792);
  });

  it("v6 存量(columns 4 无 span)同路径:零改写迁移下表单不缩宽", async () => {
    const work = await renderSpanned({ columns: 4 });
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    );
    fireEvent.change(within(work).getByLabelText("每行条数"), {
      target: { value: "1" },
    });
    fireEvent.click(within(work).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(gridTemplate(work)).toBe("repeat(1, minmax(184px, 1fr))")
    );
    expect(parseFloat(work.style.width)).toBe(792);
  });

  it("表单选更大每行条数自动升档:span 2 → 一行 3 条 → 组宽 602", async () => {
    const work = await renderSpanned({ span: 2, columns: 1 });
    enterWhiteboardMode();

    fireEvent.click(
      within(work).getByRole("button", { name: "编辑分组 工作" })
    );
    fireEvent.change(within(work).getByLabelText("每行条数"), {
      target: { value: "3" },
    });
    fireEvent.click(within(work).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(gridTemplate(work)).toBe("repeat(3, minmax(184px, 1fr))")
    );
    expect(parseFloat(work.style.width)).toBe(602);
  });
});
