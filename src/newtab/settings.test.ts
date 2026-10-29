import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  createMemorySettingsStorage,
  loadSettings,
} from "./settings";

// 设置持久化:引擎选择与收藏状态分开存储,经适配器注入;读取时做白名单校正
describe("设置读取与持久化", () => {
  it("无存储值时返回默认设置(必应)", async () => {
    const settings = await loadSettings(createMemorySettingsStorage());
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.engine).toBe("bing");
  });

  it("存储的引擎选择原样读回(模拟重开浏览器:同一适配器再次读取;旧版设置无 iconFetch 字段取默认开)", async () => {
    const storage = createMemorySettingsStorage();
    // 旧版设置形状(仅 engine):经 cast 存入,验证 loadSettings 的逐项合并
    await storage.save({ engine: "baidu" } as unknown as Parameters<
      typeof storage.save
    >[0]);

    expect(await loadSettings(storage)).toEqual({
      engine: "baidu",
      iconFetch: true,
    });
  });

  it("存储值损坏(未知引擎 id)时回退默认必应,不抛错", async () => {
    const storage = createMemorySettingsStorage({
      engine: "nonsense",
    } as never);

    expect(await loadSettings(storage)).toEqual({
      engine: "bing",
      iconFetch: true,
    });
  });
});
