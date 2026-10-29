# masonry-dnd:看板墙瀑布流 + 拖拽体验

一次用户直达需求(非 spec 派生),单工单落地:`issues/01-masonry-wall-drag-polish.md`(done)。

- 布局决策见 `docs/adr/0003-masonry-wall-js-layout.md`(为何不用 CSS 多列/网格 masonry)
- 验证:单元 233 测试全绿;真实 Chrome(vite preview + chrome-devtools)确认装箱坐标与 HTML5 DnD 落位
