# 待办卡:画布第二种卡片(todo-card)

Status: in-progress

> 四工单全部落地(2026-10-30)。

用户诉求(2026-10-30):新增功能 todo,变成 todo 卡片也放在白板区块(画布)里。

## 定案(grilling 两轮十三问,ADR-0006)

- **形态**:清单卡 = 标题 + 若干条目(勾选框 + 文本);与分组卡并排自由定位。
- **数量**:可建多张、可删;创建/删除入口在白板模式工具行;升级不预置示例卡。
- **门禁**:日常态仅可勾选/取消勾选;加删条目、改文字、改标题、拖动、排序 → 白板模式。
- **完成项**:划线置灰、沉卡底(未完成在上);不自动清除;空卡保留。
- **数据**:`BookmarkState.todos`(schema v8),JSON 备份随导随入。
- **v1 不做**:跨卡移动条目、进搜索结果、自选色(中性配色)、宽度档位(定宽 `CARD_W`)。

## 模型(schema v8)

```ts
interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}
interface TodoCard {
  id: string;
  title: string;
  items: TodoItem[];
  order: number;
  x: number;
  y: number;
}
```

- 条目嵌在卡内(自包含,备份可读);`order` 0..n−1 与分组/收藏同形状。
- `todos?: TodoCard[]` 类型可选(存量夹具零改写);迁移 v7→v8 补 `todos: []`
  (仅缺省时补,幂等)。
- 顺序不变式:toggle 是唯一的沉底执行者——完成 → 移到表尾(完成区末);
  取消 → 移到未完成区末。手工排序(白板 DnD)自由摆放,下一次 toggle 再沉底。

## 写路径(store 新增)

- `createTodo()`:标题缺省「待办」;落位画布底部追加(底部推算含分组+待办)。
- `renameTodo(id, title)`:修剪;空回退「待办」(inline 快改语义,不报错)。
- `deleteTodo(id)`:直接删,不进收集箱、无确认(ADR-0006)。
- `addTodoItem(todoId, text)`:修剪;空拒(`empty-todo-text`);插到未完成区末。
- `editTodoItem(todoId, itemId, text)`:修剪;空拒。
- `toggleTodoItem(todoId, itemId)`:翻转 + 沉底/回升(见不变式)。
- `removeTodoItem(todoId, itemId)`、`reorderTodoItems(todoId, itemIds[])`
  (全排列校验,同 `reorderGroups` 形状)。
- `setTodoPositions(positions[])`:钳界按 `CARD_W`(同 `setGroupPositions`
  口径:未知整批拒、无变化不落盘)。
- `statesEqual` 纳入 todos;`isFreshInstallState` 加「零待办卡」条件。

## 导入导出

- JSON 导出:整体序列化,自动携带。
- JSON 校验:`todos` 可缺省(≤v7 备份);给了必须是合法形状(逐字段,
  同 `isGroupShape` 风格)。
- replace:逐字恢复(坐标按 `CARD_W` 钳界)。
- merge:备份待办卡按新卡追加(重生成 id,防冲突),落画布底部追加位。
- HTML 导入导出:待办不参与(Netscape 格式装不下,静默跳过)。

## UI

- 新组件 `TodoSection`(memo,同 GroupSection 契约):卡头标题 + 条目列表;
  `.todo` 区块类(Pointer 拖拽委托选择器扩为 `.group, .todo`)。
- 日常态:勾选框可点;无删除/编辑/添加控件、无 grab。
- 白板模式:条目悬停删除钮、点文字就地编辑、卡底输入框回车添加、
  点标题改名、条目 HTML5 DnD 卡内排序(自含实现,不动 useCardDnD——
  那是收藏专用深 module)。
- Whiteboard:登记表纳入待办 id(量高/画布高/吸附 others/自动整理装箱,
  宽恒 `CARD_W`);工具行加「新建待办」;搜索过滤态隐藏待办卡
  (`filterState` 丢 todos,同「无命中分组隐藏」口径)。
- 中性配色,与分组卡的「收藏容器」视觉语言区分;CSS 随现有 design tokens。

## 实现口径(grilling 未细问、实现期定的小项)

- 空标题回退「待办」而非报错(分组 rename 报错是表单路径;待办是 inline 快改)。
- merge 导入的待办重生成 id 追加(判重无天然键)。
- 搜索过滤态隐藏待办卡(不搜文本,不过滤显示)。
