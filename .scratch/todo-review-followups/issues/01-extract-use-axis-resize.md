# 01 抽取 useAxisResize:三份轴向拖拽调尺寸孪生合一

Status: done

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

## Comments

- 2026-10-31 抽取前探针(axisProbe.test.tsx,用后即删)真值表——重构后同探针须逐行复现:
  - **W(todo,界限 [240,768],种子宽 389.33)**:`[W-aria-init] 389 240 768`;键盘 →/→/← 调用 `400,416,400`;拖出下界预览钳 `240`,pointercancel 后**不提交**(调用数不变 3)且 aria 回 `400`(已提交宽仍持有);拖出上界松手提交 `768`、aria `768`。
  - **H(todo 自适应,界限 [176,720])**:`[H-aria-init] 176 自适应`;↓/↓ 调用 `192,208`;↑ 调用 `192`;再 ↑ 调用 `176`(反直觉:minH=176 非 192,非去重路径);拖上界松手提交 `720`;小段拖拽 pointercancel 不提交。
  - **G(group,档位 [1,3])**:`[G-aria-init] 1 1 3`;→/→ 调用 span `2,3`;再 → 上界去重 no-op;拖 +200px 松手吸附提交 span `3`;pointercancel 不提交。
  - 注:票面「CSS 底柄只差 cursor 方向」不实——几何(热区边/握把尺寸方向)亦不同,按共享声明块合并、变体几何分置。
- 2026-10-31 实现完成:`src/newtab/useAxisResize.ts`(axis/min/max/base/snap/step/commit/snapshot/settled/watch 十件套;会话与键盘起点统一为 `committed ?? base(target)`,base 只供持久态基数——自适应高实测基数与调宽 committed 叠加两语义都不丢)。三调用点换配置;group 旧 pending 的 `requested` 字段本就无人读,未迁。探针复跑与真值表逐行一致后删除;510 测试全绿。真机走查(MCP):待办宽 674→768 钳上界、高 320→420 预览→416 吸附、分组 602→「宽 2 列」→412 档宽。净 -219 行。
