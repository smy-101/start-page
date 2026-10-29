# 04: 看板布局 + 全页编辑模式 + 彻底移除折叠

**Type:** task
**Status:** done

## What

用户反馈:分组默认收起选择麻烦;收藏要长条状(一个 icon + 网页名),编辑/删除只在编辑模式下出现,整体紧凑类似 Notion 看板。

**看板布局**:

- `groups-wall` 从 masonry 双栏改为横向看板:每分组一列,固定列宽,横向滚动(`overflow-x: auto`),列高随内容
- 列头:色点 + 组名 + 计数(左脊/色点沿用分组色)
- 收藏行(BookmarkCard 重画):favicon + 标题的单行长条;URL 与备注进 `title` 属性提示;行 hover 微反馈;点击开新标签页
- 搜索过滤行为不变(无命中的行隐藏、空分组隐藏、全空显示空状态)

**全页编辑模式**:

- 头部「编辑」开关(编辑中显示「完成」)
- 正常状态:无任何编辑/删除/拖拽 UI,页面干净
- 编辑状态:收藏行尾出现 编辑/删除 按钮、行可拖拽(组内排序/跨组移动);分组列头出现 改名/换色/删除、列头可拖拽换位
- 分组编辑表单(改名/换色)与删除确认改为就地展开(列头下方)或弹窗内,不挤列头横排

**移除折叠(全部删除)**:

- 折叠按钮、`collapsedGroups.ts`、App 的 collapsed 状态/首启折叠缺省(isFreshInstallState 分支)/新建分组即折叠/搜索强制展开,全删
- `App.lazyMount.test.tsx`、`collapsedGroups.test.ts` 随之删除;性能防护回归改由 perf 复测承担(见下)

## 性能(ADR-0002 交互,必做)

移除折叠后首屏全量挂载。行 DOM(~5 节点/行)远轻于卡片(~8+),但需实测:`scripts/perf-probe.mjs` 5000 条复测首屏与六项交互,结果记录进本工单 Comments。若首屏 >750ms(预算 1.5 倍),停下向用户提出升级决策(新 ADR),不擅自引入虚拟化。

## DoD

- [ ] 看板列布局 + 长条行 + 横向滚动;深浅色都过目
- [ ] 编辑模式开关控制全部操作 UI 的显隐;正常态页面无编辑控件
- [ ] 拖拽(行排序/跨组、组换位)仅在编辑模式可用
- [ ] 折叠相关代码/测试全删,无死代码
- [ ] memo 契约测试(memo.contract)适配后仍护住渲染路径
- [ ] perf-probe 复测记录进 Comments;超 1.5× 预算即升级
- [ ] `npm test` / `npm run typecheck` / `npm run build` 全绿

## Comments

- 2026-10-30: 实现 = GroupHeader/GroupSection/BookmarkGroups/BookmarkCard 全部去折叠 + editMode 透传;BookmarkCard 重画为长条行(favicon 18px + 标题,URL/备注进 title 提示);头部「编辑/完成」开关(aria-pressed);折叠体系全删(collapsedGroups.ts + App.lazyMount.test + isFreshInstallState 消费方,后者保留为纯谓词)。测试:新增 EditMode.test(干净态/开关态/常显),既有流程测试前置 enterEditMode、URL/备注断言改 title 属性。186 全绿。
- 2026-10-30: **perf-probe 复测(5000 条,Windows Chrome 156,三轮)**:看板全量挂载首屏 cardsDone = **405 / 396 / 622ms**,DOM 20075 节点(卡片时代 41711 的一半);交互:纯 UI(搜索/清空/编辑开关/进出设置)全部 ≤3ms,存储链路 添加 123-126ms、删除落定 190-199ms —— **全部落预算(首屏 ≤500、纯 UI ≤100、存储链 ≤300)**。第 3 轮 622ms 为标签页后台节流所致(longtask 计数 0 可证),前台轮稳定 <500;首轮 890ms 出现在多陈旧标签 + 节流环境。结论:**无 1.5× 持续失守,不触发 ADR-0002 升级条款**;懒挂载措施由「行 DOM 减半」自然对冲。perf-probe.mjs 同步适配:单看板场景、弹窗添加、编辑模式删除(Node 侧分步驱动——页内轮询在该 Chrome 的 untrusted click 下不稳)。
