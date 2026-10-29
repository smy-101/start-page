# 03 白板模式门禁 + nudge + 入口常驻

Status: done

Blocked by: 02

## 问题

白板模式(原「编辑模式」改名)成为唯一拖拽入口;日常态锁死但发现性不倒退(board-refresh/04 教训)。

## 方案

- 模式状态:`editMode` 更名 `whiteboardMode`(状态、props、测试、文案「编辑/完成」→「进入白板/完成」);GROUPS 词条已在 GLOSSARY 落地
- 门禁:非白板模式画布 `pointerdown` 拖动意图(位移 >5px)→ nudge「布局已锁定,进入白板模式后才能拖动分组 [进入白板]」;4s 自动消隐;一键进入
- 入口常驻:头部「进入白板」按钮(样式沿用 edit-toggle 位);白板内出「自动整理」「完成」
- 搜索时禁拖(过滤态坐标操作无意义),nudge 也不出
- 组头常时拖拽(board-refresh/04)移进门禁内;`GroupHeader` 的 `draggable={mode==="view"}` 随之门禁化(白板模式内组拖拽走 Pointer 定位,原生 DnD 只留组内收藏排序)

## 验收

- EditMode 测试更名 + 新增:日常态拖不动、nudge 出现且可一键进入、进入后可拖
- 组头非白板模式无 grab 光标/把手
- `npm test`、typecheck 过

## Comments

- 2026-10-29 立票。原型 B 变体即本票终态(`prototype/board-whiteboard` → `?variant=B`)。
- 2026-10-29 完成。落地:
  - 更名链:`editMode`→`whiteboardMode`(App 状态/BookmarkGroupsProps/WhiteboardProps/GroupSection/GroupHeader/BookmarkCard/testUtils);头部文案「编辑/完成」→「进入白板/完成」,样式沿用 `edit-toggle` 位(票面口径,类名未改);`EditMode.test.tsx` → `WhiteboardMode.test.tsx`(更名 + 门禁重写)
  - 门禁:白板模式唯一拖拽入口。日常态 pointerdown 不进会话、不 preventDefault,只记意图起点,位移 >5px(欧氏距离,含边界测试)出 nudge;4s 自动消隐、一键进入即消、进搜索即撤
  - nudge:`role="status"` 反色胶囊浮层(画布上方居中),文案与「进入白板」钮照票面;入口常驻头部
  - 搜索禁拖:意图不记、nudge 不出;白板模式内也拖不动;「自动整理」同因禁用 + 提示文案切换(code-review 认可的同口径延伸:过滤态坐标无意义)
  - 组头门禁化:`draggable={mode === "view" && whiteboardMode}` + 把手/grab 光标随 draggable 收放(board-refresh/04 常时拖拽回收入闸);墙上原生 DnD 换位、白板内 Pointer 定位均进门禁
  - 工具行(提示 + 自动整理)仅白板模式渲染;画布 `data-locked`(非模式/搜索)时无 grab 光标
  - 测试:Whiteboard.test 门禁 7 例 + WhiteboardMode.test 6 例(日常态拖不动/nudge 一键进入/进入后可拖/组头换位进门禁/工具行门禁),全量 278 绿 + typecheck 过
  - 烟测:Windows Chrome 真实输入(拖意图出 nudge×2、超时消隐×2、模式内拖拽吸附 (405,0)→(112,48)) + headless 探针((405,0)→(272,416),16px 网格);墙宿主无回归(日常 draggable=false 无把手,模式内恢复);控制台仅 preview favicon 桩 404;截图 `shots/`
- 2026-10-29 code-review(两轴)处置:
  - 修复:Whiteboard.test 头注释残留 `editMode`;`票 03`→`board-whiteboard/03` 统一拼写(33 处);`pointerEvent`/`queryNudge` 提入 testUtils(去两测试文件重复)
  - 保留:`edit-toggle` 类名(票面「样式沿用 edit-toggle 位」);自动整理搜索禁用(同口径延伸)
  - 已知过渡态:默认宿主仍是墙(04 翻转),墙日常态组头锁死无 nudge——ADR-0004「静默锁」深虑由 04 墙体退役收口,不往将死的墙复制意图检测
