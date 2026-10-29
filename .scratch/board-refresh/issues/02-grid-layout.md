# 02 全宽网格布局 + 分组样式优化

Status: done

## 问题

1120px 页宽 + 固定 264px 横向列,宽屏两侧大片留白、下方闲置(用户反馈 #3 #7);
列卡视觉平淡。

## 方案

- `.page` 放宽:`max-width: 1760px`,padding 随之加大;搜索胶囊行保持居中。
- `.groups-wall` 由横向 flex 改 CSS 网格:`grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`,
  `align-items: start`;分组自动换行铺满全宽。
- 分组列内滚动:`.group-list` 最大高度(约 `calc(100vh - 360px)` 下限 320px)overflow-y auto,
  细滚动条;条目多不把墙撑爆。
- 列卡样式打磨:色脊保留、列头排版(色点/名/计数徽章)收紧,空态/悬停细节。
- 收集箱等长列与短列同排自然对齐(网格行高取最高,列内滚动兜底)。

## 验收

- 1920 宽度下网格铺满、无两侧大空白;分组多时换行而非横向滚动。
- 深浅色截图核对;`npm test`、typecheck 过。

## Comments

- 2026-10-29 实现:.page 放宽 1760px;groups-wall 改 repeat(auto-fill, minmax(300px,1fr)) 网格,
  列内滚动 clamp(280px, 100vh-330px, 560px) + 细滚动条;空态改虚线框。1920 宽截图核对铺满。
