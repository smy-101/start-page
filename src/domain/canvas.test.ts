import { describe, expect, it } from "vitest";
import {
  CELL_GAP,
  CELL_W,
  GROUP_EDGE,
  GUIDES_PAD,
  MAX_CANVAS_W,
  MAX_GROUP_COLUMNS,
  MIN_CANVAS_W,
  alignRects,
  appendPositions,
  CANVAS_COLUMNS,
  CARD_W,
  canvasBoundWidth,
  canvasWidthOf,
  clampCanvasWidth,
  clampToCanvas,
  columnsFor,
  DEFAULT_CANVAS_W,
  effectiveCanvasWidth,
  GAP,
  groupCellsOf,
  groupSpanOf,
  groupWidthOf,
  maxSpanForCanvas,
  nearestGroupSpan,
  TODO_W_MAX,
  TODO_W_MIN,
  TODO_H_MAX,
  TODO_H_MIN,
  clampTodoWidth,
  clampTodoHeight,
  todoWidthOf,
  packCanvas,
  snapAlignment,
  spreadPositions,
  STACK_STEP,
} from "./canvas";

describe("画布几何常量", () => {
  it("三列恰好铺满 1200px 默认画布", () => {
    expect(CANVAS_COLUMNS * CARD_W + (CANVAS_COLUMNS - 1) * GAP).toBe(
      DEFAULT_CANVAS_W
    );
  });

  it("宽度界限均为 16px 吸附格点", () => {
    for (const w of [MIN_CANVAS_W, DEFAULT_CANVAS_W, MAX_CANVAS_W]) {
      expect(w % 16).toBe(0);
    }
  });
});

describe("clampCanvasWidth:宽度钳回", () => {
  it("钳回 [720, 2400],非整数向下取整", () => {
    expect(clampCanvasWidth(100)).toBe(MIN_CANVAS_W);
    expect(clampCanvasWidth(1200)).toBe(1200);
    expect(clampCanvasWidth(9999)).toBe(MAX_CANVAS_W);
    expect(clampCanvasWidth(1000.9)).toBe(1000);
  });

  it("非有限值归默认宽", () => {
    expect(clampCanvasWidth(Number.NaN)).toBe(DEFAULT_CANVAS_W);
    expect(clampCanvasWidth(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CANVAS_W);
  });
});

describe("画布宽自动档(schema v5,canvas-bounds-align/04)", () => {
  it("canvasWidthOf:固定宽钳回透传,缺省 = 自动档(undefined)", () => {
    expect(canvasWidthOf({})).toBeUndefined();
    expect(canvasWidthOf({ canvasWidth: 1760 })).toBe(1760);
    expect(canvasWidthOf({ canvasWidth: 9999 })).toBe(MAX_CANVAS_W);
    expect(canvasWidthOf({ canvasWidth: Number.NaN })).toBe(DEFAULT_CANVAS_W);
  });

  it("effectiveCanvasWidth:未钉宽撑满可用宽(钳 [MIN, MAX]);测不出退默认", () => {
    // 自动档:可用宽原样采用,越界钳回
    expect(effectiveCanvasWidth(undefined, 2000)).toBe(2000);
    expect(effectiveCanvasWidth(undefined, 9999)).toBe(MAX_CANVAS_W);
    expect(effectiveCanvasWidth(undefined, 100)).toBe(MIN_CANVAS_W);
    // jsdom/首帧测不出(0):退默认宽
    expect(effectiveCanvasWidth(undefined, 0)).toBe(DEFAULT_CANVAS_W);
    // 钉住的固定宽优先,不吃可用宽
    expect(effectiveCanvasWidth(1760, 2000)).toBe(1760);
    expect(effectiveCanvasWidth(1760, 100)).toBe(1760);
  });

  it("canvasBoundWidth:领域侧钳界——固定宽用固定值,自动档按上限", () => {
    expect(canvasBoundWidth({ canvasWidth: 1760 })).toBe(1760);
    expect(canvasBoundWidth({ canvasWidth: 9999 })).toBe(MAX_CANVAS_W);
    expect(canvasBoundWidth({})).toBe(MAX_CANVAS_W);
  });
});

describe("columnsFor:装箱列数随画布宽自适应", () => {
  it("默认 1200 三列;宽画布多列;窄画布至少一列", () => {
    expect(columnsFor(DEFAULT_CANVAS_W)).toBe(3);
    expect(columnsFor(2400)).toBe(5); // floor(2416 / 405.33…) = 5
    expect(columnsFor(1760)).toBe(4); // floor(1776 / 405.33…) = 4
    expect(columnsFor(MIN_CANVAS_W)).toBe(1); // floor(736 / 405.33…) = 1
    expect(columnsFor(CARD_W)).toBe(1); // 恰一列不存第二列
    expect(columnsFor(0)).toBe(1);
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

  it("宽画布装箱:列数随 columnsFor 自适应(2400 五列)", () => {
    expect(packCanvas([10, 10, 10, 10, 10, 10], 2400)).toEqual([
      { x: 0, y: 0 },
      { x: 405, y: 0 },
      { x: 810, y: 0 },
      { x: 1216, y: 0 }, // floor(3 × 405.33…)
      { x: 1621, y: 0 }, // floor(4 × 405.33…)
      { x: 0, y: 26 }, // 第六张回最矮列(首列)第二行
    ]);
  });

  it("零高铺开同样随宽度自适应(1760 四列)", () => {
    expect(spreadPositions(5, 1760)).toEqual([
      { x: 0, y: 0 },
      { x: 405, y: 0 },
      { x: 810, y: 0 },
      { x: 1216, y: 0 },
      { x: 0, y: STACK_STEP },
    ]);
  });

  it("宽度感知(group-width-tint):缺省 widths 与旧实现逐字一致", () => {
    expect(packCanvas([100, 100, 100, 200])).toEqual(
      packCanvas([100, 100, 100, 200], DEFAULT_CANVAS_W, [
        CARD_W,
        CARD_W,
        CARD_W,
        CARD_W,
      ])
    );
  });

  it("宽度感知:宽卡占连续槽、窗口内最高槽最小,组在槽跨度内居中", () => {
    // 两列组宽 412 → 占 2 槽(跨度 2×(CARD_W+GAP)−GAP ≈ 794.67,居中偏移 ≈ 191)
    const span2 = 2 * (CARD_W + GAP) - GAP;
    const [wide, slim] = packCanvas([100, 100], DEFAULT_CANVAS_W, [
      groupWidthOf(2),
      CARD_W,
    ]);
    expect(wide).toEqual({
      x: Math.floor((span2 - groupWidthOf(2)) / 2),
      y: 0,
    });
    // 宽卡占列 0、1(顶高 116),窄卡去唯一空着的 2 号槽
    expect(slim).toEqual({ x: 810, y: 0 });
  });

  it("宽度感知:占满整行槽位的宽卡把后续卡挤到第二行;溢出跨度的宽卡靠左", () => {
    // 六列组宽 1220 → ceil((1220+16)/405.33) = 4 槽,默认画布 3 槽只够
    // 收成 3 槽(跨槽溢出),居中偏移为负 → 防御性压回 0(靠左)
    const [hug, after] = packCanvas([50, 50], DEFAULT_CANVAS_W, [
      groupWidthOf(6),
      CARD_W,
    ]);
    expect(hug).toEqual({ x: Math.floor((1200 - groupWidthOf(6)) / 2), y: 0 });
    // 三槽全占后,窄卡从第二行起步(三列顶高均为 50+GAP)
    expect(after).toEqual({ x: 0, y: 66 });
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
    expect(clampToCanvas({ x: DEFAULT_CANVAS_W, y: 9999 })).toEqual({
      x: DEFAULT_CANVAS_W - CARD_W,
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

  it("宽参数:右界随画布宽变化(canvas-bounds-align)", () => {
    expect(clampToCanvas({ x: 900, y: 0 }, 800)).toEqual({
      x: 800 - CARD_W,
      y: 0,
    });
    expect(clampToCanvas({ x: 2000, y: 0 }, 2400)).toEqual({ x: 2000, y: 0 });
  });

  it("卡宽参数:多列组按各自宽钳右界(group-width-tint)", () => {
    // 两列组宽 400:右界 = 1200 − 400 = 800
    expect(clampToCanvas({ x: 900, y: 0 }, DEFAULT_CANVAS_W, 400)).toEqual({
      x: 800,
      y: 0,
    });
    // 缺省卡宽 = CARD_W,旧口径不变
    expect(clampToCanvas({ x: 900, y: 0 }, DEFAULT_CANVAS_W)).toEqual({
      x: DEFAULT_CANVAS_W - CARD_W,
      y: 0,
    });
  });
});

describe("每行条数几何(group-width-tint,schema v6)", () => {
  it("groupWidthOf:1 → CARD_W(存量观感逐字不变);c≥2 内宽恰装 c 格", () => {
    expect(groupWidthOf()).toBe(CARD_W);
    expect(groupWidthOf(1)).toBe(CARD_W);
    for (let c = 2; c <= MAX_GROUP_COLUMNS; c++) {
      const w = groupWidthOf(c);
      // 内宽 = w − 固定开销,恰装 c 格 + (c−1) 格距
      expect(w - GROUP_EDGE).toBe(c * CELL_W + (c - 1) * CELL_GAP);
    }
    // W(2)=412、W(6)=1172(上限 6 列 ≤ 默认画布 1200)
    expect(groupWidthOf(2)).toBe(412);
    expect(groupWidthOf(6)).toBe(1172);
    // 非法值归 1:非整数、越界、非有限
    expect(groupWidthOf(0)).toBe(CARD_W);
    expect(groupWidthOf(7)).toBe(CARD_W);
    expect(groupWidthOf(2.5)).toBe(CARD_W);
    expect(groupWidthOf(Number.NaN)).toBe(CARD_W);
  });

  it("W(1) 内宽 < 两格下限:auto-fill 单列,存量单列宽行不被自动拆分", () => {
    // 两格至少 2×CELL_W + CELL_GAP = 374;W(1) 内宽 = CARD_W − 26 ≈ 363.33
    expect(groupWidthOf(1) - GROUP_EDGE).toBeLessThan(2 * CELL_W + CELL_GAP);
    expect(groupWidthOf(2) - GROUP_EDGE).toBe(2 * CELL_W + CELL_GAP);
  });

  it("nearestGroupSpan:吸附最近列边界,越界钳回 1..上限", () => {
    expect(nearestGroupSpan(389.33)).toBe(1);
    expect(nearestGroupSpan(394)).toBe(1); // 距 W(1) 4.67 < 距 W(2) 18
    expect(nearestGroupSpan(406)).toBe(2); // 趝过中点 ~393.7
    expect(nearestGroupSpan(10000)).toBe(MAX_GROUP_COLUMNS);
    expect(nearestGroupSpan(-50)).toBe(1);
  });

  it("maxSpanForCanvas:界内放得下的最大列数,至少 1", () => {
    expect(maxSpanForCanvas(720)).toBe(3); // W(3)=602 ≤ 720 < W(4)=792
    expect(maxSpanForCanvas(DEFAULT_CANVAS_W)).toBe(MAX_GROUP_COLUMNS); // W(6)=1172 ≤ 1200
    expect(maxSpanForCanvas(2400)).toBe(MAX_GROUP_COLUMNS);
    expect(maxSpanForCanvas(100)).toBe(1);
  });
});

describe("组宽档位推导(group-span-decouple,schema v7)", () => {
  it("groupSpanOf:span 优先;缺省从 columns 推导(v6 存量零改写);非法回退链终归 1", () => {
    expect(groupSpanOf({ span: 4, columns: 1 })).toBe(4);
    expect(groupSpanOf({ columns: 4 })).toBe(4);
    expect(groupSpanOf({})).toBe(1);
    // 非法 span(非整数/越界)回退 columns;两者皆非法归 1
    expect(groupSpanOf({ span: 0, columns: 3 })).toBe(3);
    expect(groupSpanOf({ span: 2.5, columns: 3 })).toBe(3);
    expect(groupSpanOf({ span: 99, columns: 0 })).toBe(1);
  });

  it("groupCellsOf:columns 缺省 = 装满(随档位);防御钳 ≤ 档位", () => {
    expect(groupCellsOf({ span: 4 })).toBe(4);
    expect(groupCellsOf({ columns: 3 })).toBe(3);
    expect(groupCellsOf({})).toBe(1);
    // 宽组清单式:本功能的落点形态
    expect(groupCellsOf({ span: 4, columns: 1 })).toBe(1);
    // 防御:columns 越档(写路径不产生,手改 JSON 可能)钳回档位
    expect(groupCellsOf({ span: 2, columns: 4 })).toBe(2);
  });
});

describe("待办卡宽(todo-card-size-color 自由宽,schema v10)", () => {
  it("todoWidthOf:缺省 = CARD_W 逐字保留(存量零改写);存在则钳回 floor 整数", () => {
    expect(todoWidthOf({})).toBe(CARD_W);
    expect(todoWidthOf({ width: 484 })).toBe(484);
    expect(todoWidthOf({ width: 240 })).toBe(TODO_W_MIN); // 恰下界
    expect(todoWidthOf({ width: 100 })).toBe(TODO_W_MIN); // 越下界钳回
    expect(todoWidthOf({ width: 5000 })).toBe(TODO_W_MAX); // 越上界钳回
    expect(todoWidthOf({ width: 484.6 })).toBe(484); // 取整一律 floor
  });

  it("clampTodoWidth:钳 [240, 768];非有限归 floor(CARD_W)=389", () => {
    expect(clampTodoWidth(300)).toBe(300);
    expect(clampTodoWidth(100)).toBe(TODO_W_MIN);
    expect(clampTodoWidth(9999)).toBe(TODO_W_MAX);
    // 非有限归缺省附近(389),幂等:再钳不再变
    expect(clampTodoWidth(Number.NaN)).toBe(Math.floor(CARD_W));
    expect(clampTodoWidth(Number.POSITIVE_INFINITY)).toBe(Math.floor(CARD_W));
    expect(clampTodoWidth(389.33)).toBe(389);
  });
});

describe("待办卡高(todo-height-archive 定长,schema v11)", () => {
  it("clampTodoHeight:钩 [176, 720];floor 取整;非有限归下界 176", () => {
    expect(clampTodoHeight(320)).toBe(320);
    expect(clampTodoHeight(100)).toBe(TODO_H_MIN);
    expect(clampTodoHeight(9999)).toBe(TODO_H_MAX);
    expect(clampTodoHeight(320.6)).toBe(320); // 取整一律 floor
    // 非有限归下界(高的「缺省」是 undefined 自适应而非定值,
    // 垃圾输入当最近的合法界;与 clampTodoWidth 归缺省附近同思路)
    expect(clampTodoHeight(Number.NaN)).toBe(TODO_H_MIN);
    expect(clampTodoHeight(Number.POSITIVE_INFINITY)).toBe(TODO_H_MIN);
  });
});

describe("alignRects:对齐候选举(被拖卡 + 其余卡 + 画布边线)", () => {
  it("x 轴给左/中/右三源线,y 轴给上/中/下三源线", () => {
    const rect = { x: 100, y: 200, w: CARD_W, h: 60 };
    expect(alignRects(rect, "x")).toEqual([
      100,
      100 + CARD_W / 2,
      100 + CARD_W,
    ]);
    expect(alignRects(rect, "y")).toEqual([200, 230, 260]);
  });
});

describe("snapAlignment:拖拽对齐吸附(阈值 8px,含边界)", () => {
  const dragged = { x: 100, y: 200, w: CARD_W, h: 100 };

  it("左对左:阈值内吸附到精确对齐,辅助线覆盖两卡并集跨度", () => {
    const other = { x: 104, y: 400, w: CARD_W, h: 50 }; // 距 4px ≤ 8
    const snap = snapAlignment(dragged, [other], DEFAULT_CANVAS_W);
    expect(snap.x).toBe(104);
    expect(snap.y).toBeNull();
    expect(snap.guides).toEqual([
      {
        axis: "x",
        at: 104,
        from: 200 - GUIDES_PAD,
        to: 450 + GUIDES_PAD,
      },
    ]);
  });

  it("零高卡(h=0)三线合一生效;被拖在画布左沿线时吸画布边线", () => {
    const far = snapAlignment(
      { x: 0, y: 0, w: CARD_W, h: 0 },
      [{ x: 810.67 - CARD_W, y: 0, w: CARD_W, h: 0 }],
      DEFAULT_CANVAS_W
    );
    // 卡间最近线距 32px 超阈;但被拖左线 0 恰在画布左沿线 → 吸附 0 + 贯穿整幅辅助线
    expect(far.x).toBe(0);
    expect(far.guides[0]).toMatchObject({ axis: "x", at: 0, canvas: true });

    const mid = snapAlignment(
      { x: 420, y: 0, w: CARD_W, h: 0 },
      [{ x: 0, y: 0, w: CARD_W, h: 0 }],
      DEFAULT_CANVAS_W
    );
    // 被拖各线 vs 目标各线与画布各线(600 中线距被拖中线 14.67)均超阈
    expect(mid.x).toBeNull();
  });

  it("画布边线:左/中/右贯穿整幅(canvas 标记)", () => {
    // 被拖左线 100 距画布左线 0 超阈;距画布中线 600 世远;右线 489.33 距 600 超 8
    const none = snapAlignment(dragged, [], DEFAULT_CANVAS_W);
    expect(none.x).toBeNull();

    const atCenter = snapAlignment(
      { x: 600 - CARD_W / 2 + 5, y: 300, w: CARD_W, h: 100 },
      [],
      DEFAULT_CANVAS_W
    );
    expect(atCenter.x).toBe(600 - CARD_W / 2);
    expect(atCenter.guides).toEqual([
      { axis: "x", at: 600, from: 0, to: 0, canvas: true },
    ]);
  });

  it("右缘对画布右缘:吸附到 W − 卡宽", () => {
    const snap = snapAlignment(
      { x: DEFAULT_CANVAS_W - CARD_W - 6, y: 0, w: CARD_W, h: 100 },
      [],
      DEFAULT_CANVAS_W
    );
    expect(snap.x).toBe(DEFAULT_CANVAS_W - CARD_W);
    expect(snap.guides[0]).toMatchObject({ axis: "x", at: DEFAULT_CANVAS_W });
  });

  it("y 轴:顶对顶;跨度为交叉轴并集并压进画布;画布上沿线(0)贯穿整幅", () => {
    const other = { x: 0, y: 205, w: CARD_W, h: 50 };
    const snap = snapAlignment(dragged, [other], DEFAULT_CANVAS_W);
    expect(snap.y).toBe(205);
    expect(snap.guides).toContainEqual({
      axis: "y",
      at: 205,
      from: 0, // 并集 min(0) − 8 压回 0
      to: 100 + CARD_W + GUIDES_PAD, // 并集 max(489.33) + 8
    });

    const top = snapAlignment(
      { x: 0, y: 7, w: CARD_W, h: 100 },
      [],
      DEFAULT_CANVAS_W
    );
    expect(top.y).toBe(0);
    expect(top.guides).toContainEqual({
      axis: "y",
      at: 0,
      from: 0,
      to: 0,
      canvas: true,
    });
  });

  it("两轴同吸:角落对齐两线齐发", () => {
    const other = { x: 104, y: 204, w: CARD_W, h: 50 };
    const snap = snapAlignment(dragged, [other], DEFAULT_CANVAS_W);
    expect(snap.x).toBe(104);
    expect(snap.y).toBe(204);
    expect(snap.guides).toHaveLength(2);
  });

  it("多卡同线:跨度取并集", () => {
    const others = [
      { x: 104, y: 400, w: CARD_W, h: 50 },
      { x: 104, y: 600, w: CARD_W, h: 50 },
    ];
    const snap = snapAlignment(dragged, others, DEFAULT_CANVAS_W);
    expect(snap.x).toBe(104);
    expect(snap.guides[0]).toEqual({
      axis: "x",
      at: 104,
      from: 200 - GUIDES_PAD,
      to: 650 + GUIDES_PAD,
    });
  });

  it("阈值含边界:恰 8px 吸附,8.5px 不吸附", () => {
    const at8 = snapAlignment(
      { x: 108, y: 0, w: CARD_W, h: 0 },
      [{ x: 100, y: 0, w: CARD_W, h: 0 }],
      DEFAULT_CANVAS_W
    );
    expect(at8.x).toBe(100);

    const at85 = snapAlignment(
      { x: 108.5, y: 0, w: CARD_W, h: 0 },
      [{ x: 100, y: 0, w: CARD_W, h: 0 }],
      DEFAULT_CANVAS_W
    );
    expect(at85.x).toBeNull();
  });

  it("最近者优先:同轴多个目标取距离最小者", () => {
    const others = [
      { x: 96, y: 0, w: CARD_W, h: 0 },
      { x: 106, y: 500, w: CARD_W, h: 0 },
    ];
    // 被拖左线 100:距 96 号 4px、距 106 号 6px → 吸到 96
    const snap = snapAlignment(
      { x: 100, y: 0, w: CARD_W, h: 0 },
      others,
      DEFAULT_CANVAS_W
    );
    expect(snap.x).toBe(96);
  });

  it("卡片目标优先于等距的画布目标(辅助线更具体)", () => {
    // 被拖左线 4:距卡左线 0 与画布左线 0 等距 → 卡片胜出(非贯穿整幅)
    const snap = snapAlignment(
      { x: 4, y: 0, w: CARD_W, h: 0 },
      [{ x: 0, y: 100, w: CARD_W, h: 50 }],
      DEFAULT_CANVAS_W
    );
    expect(snap.x).toBe(0);
    expect(snap.guides[0].canvas).toBeUndefined();
  });
});
