# 02 白板 UI:每组拖柄调宽 + 每行条数选择

Status: done
Type: task
Blocked by: 01

GroupSection:宽度入渲染(`groupWidthOf(group.columns)`,本地预览宽优先);
组右缘拖柄(`role="separator"`,←/→ 步进一列,pointer 拖动 delta 制连续
预览、松手吸附 `nearestGroupColumns`);门禁 = 白板模式 && 非搜索 && 非折叠
(Whiteboard 算好传 `resizable`);已提交宽留到持久回流再清(同
canvasOverride 哨兵口径)。`pointerdown` stopPropagation 防劫持移动会话。

GroupHeader 编辑表单加「每行条数」下拉(1–6),与改名/换色同表单提交
(`onSetColumns`);收集箱表单不出现。

Whiteboard:拖拽钳界/对齐矩形/回流哨兵右界全部按各组渲染宽(不再统一
CARD_W);自动整理传实测宽进 packCanvas;新稳定回调 `onResizeGroup` 接线
App → store.setGroupColumns。

验收:Whiteboard/GroupCollapse/App 测试更新全绿;拖柄不与分组移动会话
互扰;搜索/日常态无拖柄。

## Comments
