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
      background: { kind: "default" },
    });
  });

  it("旧版设置无 background 字段时取默认背景(石墨/雾纸)", async () => {
    const storage = createMemorySettingsStorage();
    await storage.save({
      engine: "baidu",
      iconFetch: false,
    } as unknown as Parameters<typeof storage.save>[0]);

    expect(await loadSettings(storage)).toEqual({
      engine: "baidu",
      iconFetch: false,
      background: { kind: "default" },
    });
  });

  it("存储值损坏(未知引擎 id)时回退默认必应,不抛错", async () => {
    const storage = createMemorySettingsStorage({
      engine: "nonsense",
    } as never);

    expect(await loadSettings(storage)).toEqual({
      engine: "bing",
      iconFetch: true,
      background: { kind: "default" },
    });
  });

  it("旧版设置形状(仅 engine)读回时同样补默认背景", async () => {
    const storage = createMemorySettingsStorage();
    await storage.save({ engine: "baidu" } as unknown as Parameters<
      typeof storage.save
    >[0]);

    expect((await loadSettings(storage)).background).toEqual({
      kind: "default",
    });
  });

  it("合法纯色背景原样读回(色值归一为小写)", async () => {
    const storage = createMemorySettingsStorage({
      engine: "bing",
      iconFetch: true,
      background: { kind: "color", color: "#8FA8C8" },
    } as never);

    expect((await loadSettings(storage)).background).toEqual({
      kind: "color",
      color: "#8fa8c8",
    });
  });

  it("合法图片背景(data URL)原样读回", async () => {
    const storage = createMemorySettingsStorage({
      engine: "bing",
      iconFetch: true,
      background: {
        kind: "image",
        dataUrl: "data:image/webp;base64,QUJD",
      },
    } as never);

    expect((await loadSettings(storage)).background).toEqual({
      kind: "image",
      dataUrl: "data:image/webp;base64,QUJD",
    });
  });

  it("背景存值损坏(非法色/非图片 data URL/未知 kind)时回退默认,不抛错", async () => {
    for (const bad of [
      { kind: "color", color: "not-a-color" },
      { kind: "color", color: "#abc" },
      { kind: "image", dataUrl: "data:text/html;base64,QUJD" },
      { kind: "image" },
      { kind: "wallpaper" },
      "blue",
      null,
    ]) {
      const storage = createMemorySettingsStorage({
        engine: "bing",
        iconFetch: true,
        background: bad,
      } as never);

      expect(await loadSettings(storage)).toEqual({
        engine: "bing",
        iconFetch: true,
        background: { kind: "default" },
      });
    }
  });
});
