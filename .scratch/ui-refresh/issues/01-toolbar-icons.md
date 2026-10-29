# 01: 工具栏图标三态重制(大勾方块)

**Type:** task
**Status:** ready-for-agent

## What

用户反馈:已收藏的勾不明显;初始页(不可收藏)看起来像未收藏。重画 `scripts/generate-icons.mjs` 的三态:

- **已收藏**(`filled-{16,32}.png`):靛蓝 `#4f46e5` 圆角方块底 + 大号白勾,勾占图标主体(不再是书签丝带里的小勾)
- **未收藏**(`outline-{16,32}.png`):灰色书签描边,维持现状
- **不可收藏**(新增 `disabled-{16,32}.png`):明显更浅的灰书签描边 + 现有 × 徽标;`toolbar.ts` 的 unbookmarkable 态改用此图标

约束:零第三方依赖的手工 PNG 编码不动;`icons/` 与 `public/icons/` 同步产出;manifest 的 `action.default_icon` 不动(outline)。

## DoD

- [ ] 三态图标肉眼可辨(16px 下已收藏/未收藏/不可收藏互不混淆)
- [ ] `toolbar.ts` unbookmarkable 用 disabled 图标;title/徽标行为不变
- [ ] 单测:toolbarStateFor 三态映射不变(现有测试护住);图标路径表断言 disabled 存在
- [ ] `node scripts/generate-icons.mjs` 产出稳定;`npm test` / `npm run typecheck` / `npm run build` 全绿
