import { describe, expect, it } from "vitest";
import {
  appendPositions,
  CANVAS_COLUMNS,
  CANVAS_W,
  CARD_W,
  clampToCanvas,
  GAP,
  packCanvas,
  spreadPositions,
  STACK_STEP,
} from "./canvas";

describe("画布几何常量", () => {
  it("三列恰好铺满 1200px 画布", () => {
    expect(CANVAS_COLUMNS * CARD_W + (CANVAS_COLUMNS - 1) * GAP).toBe(CANVAS_W);
  });
});

describe("spreadPositions:零高装箱(迁移与自动整理共用)", () => {
  it("三列轮流派位,行距 STACK_STEP,坐标向下取整", () => {
    expect(spreadPositions(5)).toEqual([
      { x: 0, y: 0 },
      { x: 405, y: 0 }, // floor(1 × (CARD_W + GAP)) = floor(405.33…)
      { x: 810, y: 0 }, // floor(2 × (CARD_W + GAP)) = floor(810.67…)
      { x: 0, y: STACK_STEP },
      { x: 405, y: STACK_STEP },
    ]);
  });

  it("空集与单元素", () => {
    expect(spreadPositions(0)).toEqual([]);
    expect(spreadPositions(1)).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("packCanvas:自动整理装箱(ADR-0004;原 ADR-0003 布局算法降级)", () => {
  it("空集给空数组;高度全 0(测不出)退化零高铺开,与迁移共用策略", () => {
    expect(packCanvas([])).toEqual([]);
    expect(packCanvas([0, 0, 0, 0])).toEqual(spreadPositions(4));
  });

  it("贪心最短列:三张各占一列,第四张回最矮列第二行", () => {
    expect(packCanvas([100, 100, 100, 200])).toEqual([
      { x: 0, y: 0 },
      { x: 405, y: 0 },
      { x: 810, y: 0 },
      { x: 0, y: 116 }, // 100 + GAP,平手取靠前(首列)
    ]);
  });

  it("高矮交错无行间空隙:矮卡列承接后续卡片", () => {
    expect(packCanvas([300, 100, 100, 100])).toEqual([
      { x: 0, y: 0 },
      { x: 405, y: 0 },
      { x: 810, y: 0 },
      { x: 405, y: 116 }, // 2 号列高 116 < 首列 316,且早于 3 号列
    ]);
  });

  it("列 x 坐标向下取整,不越 clampToCanvas 右界(int px 往返无损)", () => {
    const packed = packCanvas([10, 10, 10]);
    expect(packed[2]).toEqual({ x: 810, y: 0 });
    for (const pos of packed) {
      expect(Number.isInteger(pos.x)).toBe(true);
      expect(clampToCanvas(pos)).toEqual(pos);
    }
  });
});

describe("appendPositions:画布底部追加位", () => {
  it("从现有分组的推算底部起,按堆叠步长顺次排开", () => {
    expect(
      appendPositions([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ])
    ).toEqual([
      { x: 0, y: 148 }, // max(0+48, 100+48)
    ]);
    expect(appendPositions([{ x: 0, y: 0 }], 2)).toEqual([
      { x: 0, y: 48 },
      { x: 0, y: 48 + STACK_STEP },
    ]);
  });

  it("空画布从原点起", () => {
    expect(appendPositions([])).toEqual([{ x: 0, y: 0 }]);
  });
});

describe("clampToCanvas:坐标钳回", () => {
  it("非负、x 不越过画布右界;非有限值归 0;界内值逐字保留", () => {
    expect(clampToCanvas({ x: -10, y: -5 })).toEqual({ x: 0, y: 0 });
    expect(clampToCanvas({ x: CANVAS_W, y: 9999 })).toEqual({
      x: CANVAS_W - CARD_W,
      y: 9999,
    });
    expect(
      clampToCanvas({ x: Number.NaN, y: Number.POSITIVE_INFINITY })
    ).toEqual({ x: 0, y: 0 });
    expect(clampToCanvas({ x: 405.5, y: 72.25 })).toEqual({
      x: 405.5,
      y: 72.25,
    });
  });
});
