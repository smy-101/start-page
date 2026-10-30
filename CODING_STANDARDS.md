# Coding Standards

评审轴消费;实现期无需载入(机械条目已由检查接管,见下)。

## 取整

几何计算(坐标、钳回边界、装箱、迁移)取整一律 `Math.floor`。
`Math.round` 产生越过钳回边界的值(board-whiteboard/01 P1:round 出 811 > 右界 810.67,迁移态坐标往返被改写)。
`src/domain/**` 由 ESLint `no-restricted-syntax` 拦截;UI 层几何仍由本条执规。
吸附取最近格点(`Math.round(x / SNAP) * SNAP`)语义不同,合法。

## 同步量高

挂载期测量(测高、量尺寸)走 `useLayoutEffect` + state 两腿驱动;
ref 直存方案在 StrictMode 双调用下翻车(白板原型实测,首挂载引导两趟需求即源于此)。
即时量高(如「自动整理」)先读 DOM 再入 state,不吃 state 旧账。

## 命名跟随 GLOSSARY

词条更名时,类名、文案、变量同步改(`.edit-toggle`→`.whiteboard-toggle` P2 即漏网例);
新命名先查 `GLOSSARY.md` 的词条与 Avoid 列表,再落码。
