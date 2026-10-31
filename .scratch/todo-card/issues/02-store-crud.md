# 02 store 待办 CRUD 与落点写回

Status: done

BookmarkStore 新增:createTodo(缺省标题「待办」、画布底部追加含待办推算)、
renameTodo(空回退「待办」)、deleteTodo、addTodoItem(空拒、插未完成区末)、
editTodoItem、toggleTodoItem(翻转+沉底/回升)、removeTodoItem、
reorderTodoItems(全排列校验)、setTodoPositions(CARD_W 钳界、未知整批拒、
无变化不落盘)。不变式:toggle 是唯一沉底执行者,手工 reorder 自由。

Blocked by: 01
