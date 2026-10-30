import { describe, expect, it } from "vitest";
import { BACKGROUND_MAX_EDGE, resolveTargetSize } from "./backgroundImage";

// 压缩纯逻辑(seam 2):目标尺寸策略——长边限 2560、等比缩小、绝不放大;
// canvas 重编码管线是薄封装,不单测(与 createChromeSettingsStorage 同口径)
describe("背景图压缩:目标尺寸", () => {
  it("长边超限的横图等比缩到上限(3840×2160 → 2560×1440)", () => {
    expect(resolveTargetSize(3840, 2160, BACKGROUND_MAX_EDGE)).toEqual({
      width: 2560,
      height: 1440,
    });
  });

  it("竖图以高为长边(1440×3840 → 960×2560)", () => {
    expect(resolveTargetSize(1440, 3840, BACKGROUND_MAX_EDGE)).toEqual({
      width: 960,
      height: 2560,
    });
  });

  it("方图缩到上限为正方形(3000×3000 → 2560×2560)", () => {
    expect(resolveTargetSize(3000, 3000, BACKGROUND_MAX_EDGE)).toEqual({
      width: 2560,
      height: 2560,
    });
  });

  it("不超过上限的图保持原尺寸,不放大(800×600 原样)", () => {
    expect(resolveTargetSize(800, 600, BACKGROUND_MAX_EDGE)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("非整数比例向下取整到整数像素(4000×1333 → 2560×853)", () => {
    expect(resolveTargetSize(4000, 1333, BACKGROUND_MAX_EDGE)).toEqual({
      width: 2560,
      height: 853,
    });
  });
});
