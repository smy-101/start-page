# 10a: 渲染修复(memo 化 + 消除双重提交)

**Type:** task
**Status:** ready-for-agent
**Blocked by:** None

## What

工单 10 的第一张实现票(决策见 ADR-0002、实测基线见 `docs/perf-5000-2026-10-29.md`):纯渲染层修复,**零 UX 变更**。

- **消除双重提交**:`App.tsx` 单次收藏变更目前 = `storage.onChanged → boot()` 重建 store 全树重渲染 + `run()` 成功路径 `refresh()` 再全树重渲染;收敛为一次提交(跨上下文同步能力保留——service worker 写入仍须触发重渲染)。
- **memo 化**:`GroupSection` / `BookmarkCard` 按 props 记忆化;`BookmarkGroups` 每渲染重建的 `filter + sort` 派生数组改为记忆化推导。
- **perf-probe 入库**:本次测量的 CDP 脚本整备为 `scripts/perf-probe.mjs`(灌 5000 条 → 冷加载计时 → 六项交互同步段计时),供 10a/10b 验收与后续手动复测。

## DoD

- [ ] vitest 行为断言:相同 props 的分组/卡片不因无关状态变化重渲染
- [ ] vitest 行为断言:单次收藏变更(添加/删除/编辑)恰好一次提交;外部上下文写入仍触发同步
- [ ] `npm test` / `npm run typecheck` / `npm run build` 全绿
- [ ] `scripts/perf-probe.mjs` 入库,README 或脚本头部注明用法(需 Windows 侧 Chrome + CDP 9222)
- [ ] perf-probe 复测记录进 Comments:清空搜索 ≤100ms、添加/删除 ≤300ms、进出设置页 ≤100ms

## Comments

- 2026-10-29: 由工单 10 grilling 拆出(Round 1 Q4 / Round 2 Q8)。
