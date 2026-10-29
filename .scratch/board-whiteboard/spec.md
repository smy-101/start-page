# board-whiteboard: 看板改白板自由定位 + 门禁拖拽

2026-10-29 用户提案「排版在白板上进行,平常锁拖拽,进白板模式才能拖」。grilling 一轮定五项口径 → 三变体原型(`prototype/board-whiteboard` 分支,`preview/index.html?variant=A|B|C`)→ **判定 B:白板+门禁**。决策全文见 [ADR-0004](../../docs/adr/0004-whiteboard-free-layout-gated-drag.md)。

## 决策(拷问定案,原型已验证)

1. **自由粒度**:分组卡 x/y 自由定位;组内收藏仍是竖排列表(Q1:A)
2. **门禁**:白板模式(=原「编辑模式」改名,GLOSSARY 已更新)是唯一拖拽入口;入口常驻;日常态拖动意图 → nudge「进入白板」一键引导(Q2:A,补偿 board-refresh/04 的发现性回退)
3. **画布**:固定 1200px,窗口更窄横向滚动不重排;新分组自动落第一个空位(Q3:A)
4. **吸附**:松手吸附 16px 网格;允许重叠;「自动整理」复用 planWall 贪心装箱兜底(Q4:A)
5. **实现**:Pointer 事件拖拽;画布层拦 `dragstart` 杀组头原生 DnD;组内收藏排序仍走现有 HTML5 DnD(DropHint 体系)

## 实现要点

- 数据:schema V2→V3,`groups[]` 增 `x`/`y`;存量迁移 = 现有 order + 测高 → planWall 一次装箱(装不出高度时退化均匀铺开,同 jsdom 策略)
- 卡宽全局统一 `(1200 − 2×16) / 3 ≈ 389.33`(原型口径);坐标不入收藏
- 搜索:过滤命中分组照常隐藏;白板模式内搜索保持可拖?否——搜索时禁拖(过滤态坐标无意义),票 03 定
- 原型代码是**无测试的一次性代码**:票 02 从原型提纯重写(TDD),不直接搬
- perf:ADR-0002 交互条款,票 04 复测首屏(墙的 RO 壳换成画布,挂载量不变)

## 工单

- [01-coords-schema-migration.md](issues/01-coords-schema-migration.md) 坐标数据模型与存量迁移
- [02-whiteboard-canvas-drag.md](issues/02-whiteboard-canvas-drag.md) 白板画布 + Pointer 拖拽 + 吸附 + 自动整理
- [03-whiteboard-mode-gate.md](issues/03-whiteboard-mode-gate.md) 白板模式门禁 + nudge + 入口常驻
- [04-wall-retirement-regression.md](issues/04-wall-retirement-regression.md) 墙体退役 + 行为回归 + perf 复测

阻塞边:01 → 02 → 03 → 04(链式;02 完成后 03/04 理论可并行,保守记链)。
