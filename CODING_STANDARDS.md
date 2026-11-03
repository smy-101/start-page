# Coding Standards

评审轴消费;实现期无需载入(机械条目已由检查接管,见下)。

## 格式

格式由 `.prettierrc` + lint-staged prettier 接管,评审轴不裁格式差异;diff 把离群文件带入 Prettier 风格不算噪声(edge-compat/03 评审两轴同报假阳性,实证)。

## 取整

几何计算(坐标、钳回边界、装箱、迁移)取整一律 `Math.floor`。
`Math.round` 产生越过钳回边界的值(board-whiteboard/01 P1:round 出 811 > 右界 810.67,迁移态坐标往返被改写)。
`src/domain/**` 由 ESLint `no-restricted-syntax` 拦截;UI 层几何仍由本条执规。
吸附取最近格点(`Math.round(x / SNAP) * SNAP`)语义不同,合法。

## 同步量高

测量(测高、量尺寸)走 `useLayoutEffect` + state;ref 直存方案在 StrictMode
双调用下翻车(白板原型实测,首挂载引导两趟需求即源于此)。
同步量在每次提交后都跑(不止挂载/集合变化):改组高的提交当帧回流
画布高,不闪旧边界——RO 的 setState 在绘制后才提交,赶不上这一帧
(useCardRegistry 三条腿:每提交后同步量 + RO 跟非提交变化 +
即时量高直读 DOM)。
即时量高(如「自动整理」)先读 DOM 再入 state,不吃 state 旧账。

## 命名跟随 GLOSSARY

词条更名时,类名、文案、变量同步改(`.edit-toggle`→`.whiteboard-toggle` P2 即漏网例);
新命名先查 `GLOSSARY.md` 的词条与 Avoid 列表,再落码。

## 行为冻结

深 module 抽取票的新增测试,断言值须可追溯到票面真值表:抽取前在原
组件上跑探针(临时测试,`npx vitest run <file> --disable-console-intercept`,
vitest 默认拦 console 会吞探针输出)实测捕获,用后即删,真值表落票面
Comments。无真值表支撑的断言打回;读码或注释与实测有出入,记 Comments
待裁定,冻结不动(card-dnd-deepen 实例:自悬下半指示线落在 p+2,非原
注释所称「贴自身后」)。

## 合并旧路径须垃圾输入逐字等价

把两条旧路径合一(如 normalizeTodoCard)时,验收不是「正常输入等价」:
每条旧路径对**垃圾输入**(非数值宽、null、非字符串 color)的口径也要
逐字保留。隐式强转(`Math.min`、算术、`??` 链)会在合并表达式里悄悄
改变垃圾语义——本轮实例:迁移路径字符串宽 "400" 旧归 389,合并后被
`Math.min` 强转成 400。分支语义不同时用显式条件保留各自口径,并补
测试钉住。
