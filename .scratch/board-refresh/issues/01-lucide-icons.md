# 01 UI 图标换 Lucide(内联 SVG)

Status: done

## 问题

界面动作目前是文本字形/文字链(「⚙ 设置」「＋」、行内「编辑/删除」文字钮),观感廉价(用户反馈 #5)。

## 方案

- 新建 `src/newtab/Icon.tsx`:内联 Lucide 线性图标(24 viewBox、stroke=currentColor、1.75 宽),
  按名导出用到的图标组件,零运行时依赖。
- 替换点位:
  - 页头:设置(齿轮)→ Settings;「编辑/完成」保留文字(开关语义,文字更清楚)
  - 搜索行:「＋」→ Plus
  - 弹窗:关闭「×」→ X;引擎插入符 → ChevronDown
  - 列头:编辑 → Pencil、删除 → Trash2、折叠 → ChevronDown/ChevronRight(03 票)
  - 收藏行:编辑/删除 → Pencil/Trash2(编辑模式内)
  - 设置页:返回箭头可选 ArrowLeft
- 图标钮统一 `icon-button` 样式(圆形悬停底、aria-label 保留中文语义)。
- 编辑/删除等 destructive 动作 hover 用 danger 色。

## 验收

- 全部替换点位为 SVG 图标,可聚焦、有 aria-label。
- `npm test`、`npm run typecheck` 过。

## Comments

- 2026-10-29 实现:Icon.tsx 内联 Lucide(ISC);设置齿轮/+/关闭/插入符/编辑/删除/返回全部换 SVG。
  按钮统一 icon-button 圆角底,删除钮 hover 出 danger 色;aria-label 保持中文,存量测试零改动。
