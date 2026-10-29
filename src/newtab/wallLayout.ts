/**
 * 瀑布流墙的纯布局计算(ADR-0003)。
 *
 * 页面上的分组卡高度不一(收藏数不同/折叠态),CSS grid 的行对齐会在
 * 行间留下空隙。这里用「贪心最短列装箱」:按 order 逐个把分组放进当前
 * 最矮的列,DOM 顺序保持逻辑顺序(可访问性/组间拖拽语义都不变),
 * 位置由测量到的高度计算。
 *
 * 纯函数、无副作用:测量(ResizeObserver)与挂载都在组件层,
 * 这里只做数学,便于单测。
 */

/** 一个分组卡在墙上的落点(绝对定位坐标,px)。 */
export type WallPlacement = { left: number; top: number; width: number };

export type WallPlan = { placements: WallPlacement[]; height: number };

/** 墙宽 → 列数:与 grid `repeat(auto-fill, minmax(minColumn, 1fr))` 同规则。 */
export function wallColumnCount(
  width: number,
  minColumn: number,
  gap: number
): number {
  if (!(width > 0)) return 1;
  return Math.max(1, Math.floor((width + gap) / (minColumn + gap)));
}

function samePlacement(a: WallPlacement | undefined, b: WallPlacement) {
  return (
    a !== undefined &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width
  );
}

/**
 * 贪心装箱:逐项放入当前最矮列(平手取靠前)。
 * 未测量(高度 0)时各项只推高所在列一个间距 → 均匀铺在各列首行。
 *
 * `prev` 传入上次结果:数值未变的格子沿用旧对象引用,
 * 下游 GroupSection 的 React.memo 才不会被无关位移击穿。
 */
export function planWall(
  heights: readonly number[],
  columnCount: number,
  wallWidth: number,
  gap: number,
  prev?: readonly WallPlacement[]
): WallPlan {
  const cols = Math.max(1, columnCount);
  const inner = wallWidth > 0 ? wallWidth - gap * (cols - 1) : 0;
  const columnWidth = inner > 0 ? inner / cols : 0;

  const columnHeights = new Array<number>(cols).fill(0);
  const placements = heights.map((height, i) => {
    let target = 0;
    for (let c = 1; c < cols; c++) {
      if (columnHeights[c] < columnHeights[target]) target = c;
    }
    const fresh: WallPlacement = {
      left: target * (columnWidth + gap),
      top: columnHeights[target],
      width: columnWidth,
    };
    columnHeights[target] += height + gap;
    const kept = prev?.[i];
    return samePlacement(kept, fresh) ? (kept as WallPlacement) : fresh;
  });

  const height = Math.max(0, ...columnHeights.map((h) => h - gap));
  return { placements, height };
}
