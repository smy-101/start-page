import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCollapsedGroups, saveCollapsedGroups } from "./collapsedGroups";

/** 工单 10b:折叠偏好的 recorded 语义 —— 键存在与否区分「已记录」与「从未记录」。 */
const COLLAPSED_KEY = "start-page:collapsed-groups";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("折叠偏好读取", () => {
  it("键不存在:未记录,ids 为空集", () => {
    expect(loadCollapsedGroups()).toEqual({ recorded: false, ids: new Set() });
  });

  it("已记录:ids 照办,非字符串项被过滤", () => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(["g1", 2, null, "g2"]));
    expect(loadCollapsedGroups()).toEqual({
      recorded: true,
      ids: new Set(["g1", "g2"]),
    });
  });

  it("键存在但值损坏(非 JSON / 非数组):按已记录的空集处理,不回退全新安装缺省", () => {
    localStorage.setItem(COLLAPSED_KEY, "垃圾{");
    expect(loadCollapsedGroups()).toEqual({ recorded: true, ids: new Set() });
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify({ not: "array" }));
    expect(loadCollapsedGroups()).toEqual({ recorded: true, ids: new Set() });
  });

  it("保存后读取:往返一致且已记录", () => {
    saveCollapsedGroups(new Set(["a", "b"]));
    expect(loadCollapsedGroups()).toEqual({
      recorded: true,
      ids: new Set(["a", "b"]),
    });
  });

  it("localStorage 不可用:读取按未记录处理、保存不抛错", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(loadCollapsedGroups()).toEqual({ recorded: false, ids: new Set() });
    expect(() => saveCollapsedGroups(new Set(["x"]))).not.toThrow();
  });
});
