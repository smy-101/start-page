# 分组看板改白板自由定位,拖拽锁进白板模式(取代 ADR-0003 瀑布流墙)

用户提案「排版在白板上进行,平常不允许拖曳,必须进白板模式」。grilling 一轮定五项口径(自由粒度/门禁发现性/坐标自适应/重叠空隙/原型先行),三变体 UI 原型(`prototype/board-whiteboard` 分支,preview harness `?variant=`)对比后 **2026-10-29 判定 B:白板+门禁**。

## Considered Options

- **A · 维持顺序墙(现状)**:自适应强、零迁移,但布局自由度低——用户要"哪几组摆在一起"的主控权。
- **B · 白板+门禁(选定)**:分组卡 x/y 坐标自由定位;拖拽唯一入口是「白板模式」;日常态锁死,拖动意图出 nudge 引导。
- **C · 白板免门禁**:自由最大,但误拖风险回到编辑模式门禁要解决的初衷;原型手感对比后弃。
- **自由编辑有序渲染**(拖拽仅定相对格局,渲染仍自适应重排):省自适应的坑但"自由"是假的;弃。

## Consequences

- **范式**:坐标即布局。分组存 x/y(schema V2→V3),存量 order 布局用 planWall 装箱一次性迁移;`order` 保留作 DOM/Tab 序(可访问性)。
- **门禁**:白板模式=原「编辑模式」升级改名(GLOSSARY 已更新);board-refresh/04 的"组头常时可拖"回退进门禁,发现性以**常驻入口 + 拖动意图 nudge**补偿(04 的教训:静默的锁会被当成"不能拖")。
- **画布**:固定 1200px,窗口更窄横向滚动,不重排;新分组自动落第一个空位。
- **吸附与兜底**:松手吸附 16px 网格;允许重叠;「自动整理」复用 planWall——ADR-0003 的装箱算法从布局引擎**降级为整理算法**,墙的测高/RO 壳退役。
- **拖拽实现**:Pointer 事件(跟手),画布层拦 `dragstart` 杀组头原生 DnD(否则劫持 pointermove);组内收藏排序仍走 HTML5 DnD 体系(DropHint 等)。
- 原型为一手资料:`git checkout prototype/board-whiteboard`,`preview/index.html?variant=B` 可复跑;实现工单 `.scratch/board-whiteboard/`。
