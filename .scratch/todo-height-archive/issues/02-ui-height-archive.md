# 02-ui:底缘调高拖柄 + 归档钮 + 定长滚动布局

Status: done

## 事

Blocked by: 01

- `Icon.tsx`:新增 `ArchiveIcon`(内联 Lucide archive 路径, ISC)。
- `TodoSection.tsx`:
  - 高度会话镜像调宽(preview/committed 双状态 + 回流哨兵 + 键盘步进):
    底缘拖柄 `.todo-resize-b`(role=separator、aria-orientation=horizontal、
    ↑/↓ 步进一格 16px 网格、徽章回显 px);`resizable` 门禁同宽柄。
  - 定长渲染:`height` = previewH ?? committedH ?? todo.height,存在时
    `data-fixed-height="true"`;自适应态不带 height style。
  - 卡头归档钮(两模式可见,置于计数后):`aria-label` 参数化卡名,
    title「归档已完成条目」;`items.every(!done)` 时 disabled;
    点击 `onClearDoneItems(todo.id)`。
- `App.tsx`:`handleResizeTodoHeight`/`handleClearTodoDone` 稳定身份
  (useCallback 接 store);props 透传 Whiteboard → TodoSection
  (`onResizeTodoHeight`/`onClearTodoDone`)。
- `index.css`:
  - `.todo[data-fixed-height="true"]`:纵向 flex(卡头/添加行 flex:none,
    `.todo-list` flex:1 + min-height:0 + max-height:none)。
  - `.todo-resize-b`:整宽热区贴卡底缘内侧,横向握把胶囊(同
    `.todo-resize` 语言,cursor ns-resize);徽章复用 `.todo-resize-badge`。

## 验收

- TodoSection.test:定长 style.height + data-fixed-height、缺省自适应不带;
  底柄门禁(resizable 才挂载)、键盘 ↑/↓ 步进写回、拖拽松手 16px 吸附;
  归档钮两模式可见、无完成禁用、点击回调 onClearDoneItems。
- Whiteboard/App:透传断言(沿用现有管线测试口径)。
- memo.contract:新 props 身份稳定。

## Comments

- 2026-11-16 实现定案:自适应卡的调高基数取**事件时实测高**(即时量高
  口径:拖柄 pointerdown / 键盘步进时 `closest("section").getBoundingClientRect()`
  直读,jsdom 为 0 → 下界兜底 176)——↑ 首步从实际观感高长起,不从
  下界跳变;自适应态底柄读数 aria-valuetext 报「自适应」(valuenow 为
  下界兜底基数)。徽章在底柄上居中悬于柄上方(柄仅 10px 高,复用右上
  定位会被卡面 overflow:hidden 裁掉)。归档钮 aria-label
  `归档待办卡 {标题} 已完成条目`,title「归档已完成条目」;新增
  `.icon-button:disabled` 降透明度样式(此前无禁用态 icon-button)。
  memo.contract 实查仅覆盖 BookmarkCard,不需改;Whiteboard.test 板级
  props 补 onResizeTodoHeight/onClearTodoDone 透传。真机(Windows Chrome
  - 静态 preview 构建)走查:键盘 320→336、归档 10 条清 4 条余 6 条、
    底柄拖拽 187+200 预览 387 松手吸附 384 均符。
