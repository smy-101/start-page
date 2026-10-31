# 01 抽取 useAxisResize:三份轴向拖拽调尺寸孪生合一

Status: ready-for-agent

来源:todo-card-size-color + todo-height-archive 的 code-review(Standards P1,Duplicated Code)。

## 问题

轴向拖拽调尺寸的逻辑存在三份近乎相同的实现:

- `src/newtab/TodoSection.tsx`:调宽(previewW/committedW/sessionRef/pendingRef + sentinel effect + pointer-listener effect + applyResize/finishResize/cancelResize/pointerdown/keydown)~90 行;
- 同文件 H 后缀镜像一套(注释自认「镜像调宽」);
- `src/newtab/GroupSection.tsx:100-205`:分组卡右缘调宽第三份。

CSS `.todo-resize` / `.todo-resize-b` 同样是孪生。

## 方案

抽 `useAxisResize({ axis, min, max, snap, commit })` hook,三处调用点换成配置;
CSS 两规则合一(底柄只差 cursor 方向)。

## 验收

- 既有 delta 制测试全部保持通过(行为零变化,纯结构重构);
- `npm test` 全绿,真机走查调宽/调高手感不变。

Blocked by: (none)
