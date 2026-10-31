import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pageToast, showTabToast, toastTextFor } from "./toast";

/** 页面内提示条(pageToast):注入函数的 DOM 行为。 */
describe("pageToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("挂载底部居中的胶囊提示条并进入可见态", async () => {
    pageToast("✓ 已收藏到收集箱");

    const el = document.getElementById("start-page-toast");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("✓ 已收藏到收集箱");
    // 关键样式:固定定位、不挡交互、页面内容之上
    expect(el!.style.position).toBe("fixed");
    expect(el!.style.pointerEvents).toBe("none");
    expect(el!.style.zIndex).toBe("2147483647");
    expect(el!.style.opacity).toBe("0");

    // 下一帧进入可见态(transition 起点)
    await vi.advanceTimersByTimeAsync(20);
    expect(el!.style.opacity).toBe("1");
  });

  it("停留 1.8s 后淡出并移除自身", async () => {
    pageToast("已取消收藏");
    const el = document.getElementById("start-page-toast")!;

    await vi.advanceTimersByTimeAsync(20);
    expect(el.style.opacity).toBe("1");
    expect(document.body.contains(el)).toBe(true);

    await vi.advanceTimersByTimeAsync(1800);
    expect(el.style.opacity).toBe("0");

    await vi.advanceTimersByTimeAsync(250);
    expect(document.getElementById("start-page-toast")).toBeNull();
  });

  it("重复触发:同一元素换文案并重置计时,不叠加多条", async () => {
    pageToast("✓ 已收藏到收集箱");
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(1500); // 已停 1.5s,临近淡出

    pageToast("已取消收藏");
    const els = document.querySelectorAll("#start-page-toast");
    expect(els.length).toBe(1);
    expect(els[0].textContent).toBe("已取消收藏");

    // 计时已重置:原 300ms 后就该淡出的元素仍在,完整停留后一起消失
    await vi.advanceTimersByTimeAsync(300);
    expect((els[0] as HTMLElement).style.opacity).toBe("1");
    await vi.advanceTimersByTimeAsync(1800 + 250);
    expect(document.getElementById("start-page-toast")).toBeNull();
  });
});

/** toastTextFor:按操作前状态给文案。 */
describe("toastTextFor", () => {
  it("操作前未收藏 → 收藏文案(带 ✓);已收藏 → 取消文案", () => {
    expect(toastTextFor(false)).toBe("✓ 已收藏到收集箱");
    expect(toastTextFor(true)).toBe("已取消收藏");
  });
});

/** showTabToast:executeScript 接线与失败回退信号。 */
describe("showTabToast", () => {
  type Inject = Parameters<typeof chrome.scripting.executeScript>[0];
  const g = globalThis as { chrome: Record<string, unknown> };

  /** 换上记录调用的 scripting mock;返回调用日志与还原函数。 */
  function mockScripting(impl: (inject: Inject) => Promise<unknown>) {
    const calls: Inject[] = [];
    const original = g.chrome.scripting;
    g.chrome.scripting = {
      executeScript: (inject: Inject) => {
        calls.push(inject);
        return impl(inject);
      },
    };
    return {
      calls,
      restore: () => {
        g.chrome.scripting = original;
      },
    };
  }

  afterEach(() => {
    // 各用例自行 restore;此处兜底删除 mock
    delete g.chrome.scripting;
  });

  it("成功:注入 pageToast 与文案,返回 true", async () => {
    const mock = mockScripting(async () => [{ result: undefined }]);
    try {
      await expect(showTabToast(7, "✓ 已收藏到收集箱")).resolves.toBe(true);
      // files 变体无 func/args,收窄到 func 注入分支
      const inject = mock.calls[0] as {
        target: { tabId: number };
        func: (text: string) => void;
        args: string[];
      };
      expect(inject.target).toEqual({ tabId: 7 });
      expect(inject.func).toBe(pageToast);
      expect(inject.args).toEqual(["✓ 已收藏到收集箱"]);
    } finally {
      mock.restore();
    }
  });

  it("不可注入页面(注入抛错)→ 返回 false 供调用方回退徽标", async () => {
    const mock = mockScripting(async () => {
      throw new Error("cannot access contents of the page");
    });
    try {
      await expect(showTabToast(7, "已取消收藏")).resolves.toBe(false);
    } finally {
      mock.restore();
    }
  });
});
