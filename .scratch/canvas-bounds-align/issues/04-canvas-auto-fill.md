# 04 画布宽自动档:缺省撑满可用宽(schema v5)

Status: done

Blocked by: 03

## 问题

用户反馈:宽屏(2560px)上画布只占屏心一条——容器上限 1760 居中留 ~400px 边,
画布默认 1200 又只在容器内容宽(1688)里占左侧,右侧再空 ~490px。要求缩小
白板两侧空白、扩大画布面积。

默认 1200 来自 v3→v4 迁移对全部存量的回填,并非用户意愿;拖柄调宽虽可解,
但缺省体验应当在任何屏宽下都不留大片空白。

## 方案

- **自动档(schema v5)**:`canvasWidth` 缺省 = 自动——画布撑满可用宽
  (组件用 ResizeObserver 实测 `.whiteboard-scroll` clientWidth,无 RO 退
  resize 监听),钓回 [720, 2400](`effectiveCanvasWidth`,测不出退默认 1200)。
  拖柄调宽后钉住为固定宽入库(现有交互不变,语义从「调宽」变为「钉宽」)。
- **v4→v5 迁移**:恰等于默认 1200 的存储宽按回填剥离回自动档(与「用户调过」
  无法区分,刻意调回 1200 的会被误剥——重拖一次拖柄即恢复,已知代价)。
  调过的宽(≠1200)与非法宽(钳回)照旧。
- **领域侧钳界**(`canvasBoundWidth`):固定宽按固定值;自动档无存储值按
  上限 2400 钳(拖拽落点已被组件按实际渲染宽先行钳过;钉窄时
  `setCanvasWidth` 统一重钳,与既有缩宽径一致)。
- **statesEqual / setCanvasWidth 逐字比较**:缺省(自动)≠ 钉住的 1200;
  自动档钉任意值都算变化并落盘。
- **导入导出**:备份缺省宽保持缺省(auto 往返不补数值);v3 及更早备份
  导入后为自动档;merge 保留本地(固定宽钓回保留,自动档保持自动)。
- **页面容器**:`.page` 上限 1760 → 2448(= 画布上限 2400 + 两侧衬距 24),
  左右衬距 36 → 24:超宽屏两侧对称留白,自动档恰能撑满容器内容宽。

## 验收

- canvas.test:`canvasWidthOf`(缺省透传)/`effectiveCanvasWidth`
  (撑满、钓界、测不出退默认、钉住优先)/`canvasBoundWidth`(上限口径)。
- migrations.test:v3/v4(1200)→ 自动档;v4(1760)→ 保留;幂等;
  statesEqual 逐字比较。
- store.test:新建库不带宽;自动档落点按上限不钬 1200;钉宽(含恰 1200)
  落盘;钉窄重钳。
- importExport.test:v4 回填 1200 replace 剥离;v5 auto 备份往返保留缺省;
  v3 备份 → 自动档(出界坐标按上限钓)。
- Whiteboard.test:自动档随可用宽撑满(桩 clientWidth + resize)、越上限
  钬 2400、钉住优先;jsdom 测不出退默认 1200(既有用例口径不变)。
- vitest 323 绿;tsc/eslint 零告警。

## Comments

- 2026-11-04 完成。落地文件:`canvas.ts`(三个宽度解析函数)、`types.ts`
  (SCHEMA_VERSION 5)、`migrations.ts`(v4→v5 剥离回填 + 修复仅针对已存在
  非法值)、`store.ts`(initialState 不写宽、钳界/落盘口径)、
  `importExport.ts`(缺省保持缺省)、`Whiteboard.tsx`(滚动壳测量 +
  effectiveCanvasWidth + 工具行提示语)、`index.css`(`.page` 2448/24px)。
  ADR-0004 与 GLOSSARY「画布」已同步补记。
- 遗留(未做):钉宽后回自动档无入口(如拖柄双击/工具行「自动宽」钮),
  需要时另开工单。
- 2026-11-04 真实浏览器烟测(Windows Chrome + preview harness)发现并修复一处:
  拖柄热区原外挂在画布右缘(`right: -7px`),自动档下画布宽恰等于滚动壳
  内容宽,外挂 7px 会凭空滚出横向滚动条——改为贴内侧(`right: 0`,握把
  `right: 5px`)。实测:2560 视口日常/白板均 2400px 撑满、零横向滚动;
  1366 视口自动 1320px 贴边无滚动;键盘钉宽 1336 → 滚动出现(钉宽超窗)
  → 回 1320 滚动消失;控制台仅预览 harness 既有的 favicon 桩 404,零新增。
  截图 `shots/04-whiteboard-2560.png`。
