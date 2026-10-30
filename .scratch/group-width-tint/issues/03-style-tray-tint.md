# 03 样式:去色脊 + 淡染玻璃托盘 + 多列网格

Status: done
Type: task
Blocked by: 02

删 `.group::before` 色脊柱(含注释口径);托盘底
`color-mix(in srgb, var(--group-color) 8%, var(--tray))`、边框 18% 组色;
`:root[data-start-background]` 下组托盘半透明(bg 72%)磨砂 blur(8px)。
`.group-grid` 改 grid(auto-fill minmax(184px,1fr);minmax 口径与 CELL_W
同源注释互指);`.drop-indicator`/`.card-editing` 跨全行;`.card`
min-width: 0。新增 `.group-resize` 拖柄样式(参考 .wb-resize 缩小版)。

验收:preview 走查浅色/深色/图片背景三种底,单列观感与改版前一致
(除色脊),多列横条截断正常;深浅色对比度可读。

## Comments
