import { useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

/**
 * 轴向拖拽调尺寸(todo-review-followups/01):preview/committed 双状态 +
 * 回流哨兵 + 指针监听 + 键盘步进的深 module,收敛待办卡调宽/调高与
 * 分组卡调宽三份孪生实现。
 *
 * - delta 制(基数 + 指针位移),不依赖 rect——jsdom 几何全 0 亦可测;
 * - 拖中连续预览钳 [min,max];松手 snap 吸附后再钳,已提交值留到持久
 *   回流再清(免闪回);pointercancel 不提交;
 * - 键盘步进吃本地已提交值(回流前连按可累计),|next-base|<0.5 视为
 *   原地(上界/下界 no-op);
 * - 回流哨兵:持久值追上已提交、或提交时快照偏离(钳回/外部改动)
 *   即解除本地值——两分支判据因调用点而异,经 settled 注入。
 */
export type AxisResizeConfig<S> = {
  /** 拖拽轴:x=调宽(clientX、←/→),y=调高(clientY、↑/↓) */
  axis: "x" | "y";
  /** 界限(预览与提交后均钳) */
  min: number;
  max: number;
  /**
   * 持久态基数(事件时取值):调高等实测值在此读 DOM(即时量高口径);
   * 会话/键盘起点 = 本地已提交值 ?? base(调用点无须感知 committed)。
   */
  base: (target: EventTarget | null) => number;
  /** 松手吸附:预览值 → 落值(吸附后钳界由 hook 统一做) */
  snap: (preview: number) => number;
  /** 键盘步进:当前值 + 方向 → 下一值(钳界/原地去重由 hook 统一做) */
  step: (current: number, dir: 1 | -1) => number;
  /** 提交落值(松手吸附值/键盘步进值) */
  commit: (value: number) => void;
  /** 提交时快照(供 settled 判别「外部改动/钳回」) */
  snapshot: () => S;
  /** 回流判定:持久值追上已提交、或快照偏离(两分支) */
  settled: (committed: number, snapshot: S | null) => boolean;
  /** settled 判据依赖的持久状态(todo/group 对象;身份变化时重查) */
  watch: unknown;
};

/** useAxisResize 供给:生效值分量 + 绑到拖柄元素的句柄事件。 */
export type AxisResize = {
  /** 拖中连续预览值;null = 未在拖 */
  preview: number | null;
  /** 松手/键盘后的本地已提交值(持久回流前持续生效);null = 无本地值 */
  committed: number | null;
  /** 绑到拖柄元素:开session/键盘步进 */
  handleProps: {
    onPointerDown: (event: ReactPointerEvent) => void;
    onKeyDown: (event: ReactKeyboardEvent) => void;
  };
};

/** 键 → 方向(按轴;非本轴键 = 0 不处理)。 */
function keyDir(axis: "x" | "y", key: string): 0 | 1 | -1 {
  if (axis === "x") {
    if (key === "ArrowRight") return 1;
    if (key === "ArrowLeft") return -1;
  } else {
    if (key === "ArrowDown") return 1;
    if (key === "ArrowUp") return -1;
  }
  return 0;
}

export function useAxisResize<S>(config: AxisResizeConfig<S>): AxisResize {
  const { axis, min, max, base, snap, step, commit, snapshot, settled, watch } =
    config;
  const [preview, setPreview] = useState<number | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const sessionRef = useRef<{ startClient: number; startBase: number } | null>(
    null
  );
  const pendingRef = useRef<S | null>(null);

  // 回流哨兵:持久值追上已提交即清;store 钳回不同值(窄画布收窄)或
  // 被外部改动时持久值偏离提交时快照,同样解除本地值
  useEffect(() => {
    if (committed === null) {
      pendingRef.current = null;
      return;
    }
    if (settled(committed, pendingRef.current)) {
      setCommitted(null);
      pendingRef.current = null;
    }
    // settled 闭包读渲染期 todo/watch;判据依赖经 watch 声明
  }, [committed, watch]);

  /** 拖中一步:连续预览,钳 [min, max](吸附留到松手)。 */
  function apply(clientCoord: number): void {
    const session = sessionRef.current;
    if (!session) return;
    const next = session.startBase + (clientCoord - session.startClient);
    setPreview(Math.min(Math.max(next, min), max));
  }

  function finish(): void {
    const session = sessionRef.current;
    const value = preview;
    sessionRef.current = null;
    setPreview(null);
    if (!session || value === null) return;
    // 松手吸附后再钳界限;已提交值留到持久回流再清
    const next = Math.min(Math.max(snap(value), min), max);
    pendingRef.current = snapshot();
    setCommitted(next);
    commit(next);
  }

  function cancel(): void {
    sessionRef.current = null;
    setPreview(null);
  }

  useEffect(() => {
    if (sessionRef.current === null && preview === null) return;
    const move = (event: PointerEvent) => {
      if (sessionRef.current)
        apply(axis === "x" ? event.clientX : event.clientY);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    // 会话回调读的是渲染期最新闭包;挂仅发生在会话期间
  });

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // 不劫持卡移动会话(画布级 pointerdown 委托)
    event.stopPropagation();
    const startBase = committed ?? base(event.currentTarget);
    sessionRef.current = {
      startClient: axis === "x" ? event.clientX : event.clientY,
      startBase,
    };
    setPreview(startBase);
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const dir = keyDir(axis, event.key);
    if (dir === 0) return;
    event.preventDefault();
    const current = committed ?? base(event.currentTarget);
    const next = Math.min(Math.max(step(current, dir), min), max);
    if (Math.abs(next - current) < 0.5) return;
    pendingRef.current = snapshot();
    setCommitted(next);
    commit(next);
  };

  return {
    preview,
    committed,
    handleProps: { onPointerDown, onKeyDown },
  };
}
