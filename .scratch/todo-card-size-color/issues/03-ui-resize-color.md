# 03-ui:白板调宽拖柄 + 卡头选色 + CSS 表达

Status: done

## 事

Blocked by: 02

- Whiteboard:`widthOf` 待办分支换 `todoWidthOf(todoSpanOf(t))`;
  透传 `onResizeTodoSpan`/`onRecolorTodo`、`resizable={!locked}`、
  `resizeMaxSpan={maxTodoSpanForCanvas(canvasW)}` 给 TodoSection。
- TodoSection:
  - 调宽会话镜像 GroupSection(preview/committed 双状态 + 回流哨兵 +
    键盘步进),拖柄 `.todo-resize`(role=separator,读数徽章报 px);
    无 columns 耦合,哨兵只盯 span 快照。
  - 卡头(白板模式)增调色钮,展开卡内 `.todo-color-row`:ColorSwatches
    (aria-label 参数化,缺省「分组颜色」不破坏既有用法)+「中性」复位钮;
    有色时 `style 注入 --todo-color` + `data-todo-colored="true"`。
  - `canvasStyle.width` = previewW ?? committedW ?? todoWidthOf(span)。
- App:handleResizeTodoSpan/handleRecolorTodo 稳定身份接 store;props 透传。
- CSS:`.todo-resize`/徽章(同 .group-resize 语言);`[data-todo-colored]`
  卡面底染 12% + 边框带色 + 自定义背景磨砂同形;勾选框/指示线**保持墨色**。

## 验收

- Whiteboard.test:待办按档位渲染宽、装箱按档位宽。
- TodoSection.test:拖柄挂载门禁(白板模式)、松手吸附档位、键盘步进、
  aria;调色钮展开色板、选色写回、中性复位(空串)、--todo-color 注入。
- memo.contract:新 props 身份稳定。

## Comments

- 2026-11-14 二次调校(定案):拖柄松手从档位吸附改 16px 网格吸附(连续
  预览、徽章回显实时 px);键盘 ←/→ 步进一格 16px 网格(从当前宽的上/下
  一格起算,缺省 389.33 → 400/384);props resizeMaxSpan → resizeMaxW
  (Whiteboard 供给 min(TODO_W_MAX, canvasW)),onResizeSpan → onResizeWidth。
