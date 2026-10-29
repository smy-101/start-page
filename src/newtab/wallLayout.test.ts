import { describe, expect, it } from "vitest";
import { planWall, wallColumnCount } from "./wallLayout";

/** 300px 最小列宽、16px 间距:与页面看板常量一致。 */
const MIN_COLUMN = 300;
const GAP = 16;

describe("wallColumnCount", () => {
  it("宽度为 0(未测量/jsdom)时退化为单列", () => {
    expect(wallColumnCount(0, MIN_COLUMN, GAP)).toBe(1);
  });

  it("容不下一列最小宽度时仍给一列", () => {
    expect(wallColumnCount(200, MIN_COLUMN, GAP)).toBe(1);
  });

  it("恰好容纳两列(含间隙)给两列,差 1px 给一列", () => {
    expect(wallColumnCount(MIN_COLUMN * 2 + GAP, MIN_COLUMN, GAP)).toBe(2);
    expect(wallColumnCount(MIN_COLUMN * 2 + GAP - 1, MIN_COLUMN, GAP)).toBe(1);
  });

  it("大宽度按可用空间给足列数", () => {
    // (1760 - 64 + 16) / 316 = 5.4 → 5 列(页面 max-width 1760)
    expect(wallColumnCount(1760, MIN_COLUMN, GAP)).toBe(5);
  });
});

describe("planWall:贪心最短列装箱", () => {
  it("空墙高度为 0", () => {
    expect(planWall([], 3, 900, GAP)).toEqual({ placements: [], height: 0 });
  });

  it("后续分组落入当前最矮的列:高矮交错无行间空隙", () => {
    // 列宽 (900 - 2*16) / 3 = 289.33…,列步长 289.33 + 16
    const stride = (900 - 2 * GAP) / 3 + GAP;
    const { placements, height } = planWall([300, 100, 100, 100], 3, 900, GAP);

    // 前三个各占一列
    expect(placements[0]).toMatchObject({ left: 0, top: 0 });
    expect(placements[1].left).toBeCloseTo(stride);
    expect(placements[2].left).toBeCloseTo(stride * 2);
    // 第四个落最矮列(1、2 号并列 100,取靠前的 1 号列),紧贴其下
    expect(placements[3]).toMatchObject({ left: stride, top: 100 + GAP });
    // 墙高 = 最高列 300,无行对齐留下的空隙
    expect(height).toBe(300);
  });

  it("列宽均匀铺满墙宽,间距计入", () => {
    const { placements } = planWall([10, 10], 2, 616, GAP);
    expect(placements[0].width).toBe(300);
    expect(placements[1].width).toBe(300);
    expect(placements[1].left).toBe(316);
  });

  it("未测量高度(全 0)时均匀铺在各列首行,不叠成一摞", () => {
    const { placements } = planWall([0, 0, 0], 3, 900, GAP);
    expect(placements.map((p) => p.top)).toEqual([0, 0, 0]);
    expect(placements[1].left).toBeGreaterThan(0);
  });

  it("结果复用:数值未变的格子沿用上次对象引用(memo 前提)", () => {
    const first = planWall([100, 100], 2, 616, GAP);
    const second = planWall([100, 100], 2, 616, GAP, first.placements);
    expect(second.placements[0]).toBe(first.placements[0]);
    expect(second.placements[1]).toBe(first.placements[1]);
  });

  it("高度变化只换位移格子的对象身份,未动的沿用", () => {
    // 两列:0 号格变高后,第三张卡从 0 号列改落 1 号列
    const before = planWall([100, 100, 50], 2, 616, GAP);
    const after = planWall([300, 100, 50], 2, 616, GAP, before.placements);
    expect(after.placements[0]).toBe(before.placements[0]);
    expect(after.placements[1]).toBe(before.placements[1]);
    expect(after.placements[2]).not.toBe(before.placements[2]);
    expect(after.placements[2]).toMatchObject({ left: 316, top: 100 + GAP });
  });

  it("prev 短于新序列时安全", () => {
    const prev = [{ left: 0, top: 0, width: 300 }];
    const { placements } = planWall([10, 10, 10], 2, 616, GAP, prev);
    expect(placements).toHaveLength(3);
  });
});
