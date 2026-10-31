# 04-store-ui:钉住/解除定长切换 + dist 陈旧修复

Status: done

## 事

Blocked by: 02

- store:`setTodoHeight(id, height: number | undefined)`——undefined =
  解除定长回自适应(剥离字段;已自适应不落盘,同 recolorTodo 空串
  复位中性的语义形状)。
- `Icon.tsx`:PinIcon/PinOffIcon(内联 Lucide,ISC)。
- TodoSection 卡头钉住钮(白板模式,与调色/删除并列):自适应态
  PinIcon + title「钉住高度(定长)」,点击 = 实测高吸附 16px 网格
  钳界落定长;定长态 PinOffIcon + title「解除定长(回自适应)」,
  aria-pressed 反映定长态,点击 = undefined 写回。
- CSS:`.todo-pin[aria-pressed="true"]` 压下强调。
- 文档:GLOSSARY「待办卡高」补切换;ADR-0006 第三补记追加二次段。

## 验收

- store.test:undefined 剥离回自适应、已自适应不落盘、未知卡拒。
- TodoSection.test:门禁仅白板模式;自适应点击 176(jsdom 实测 0 →
  下界兜底);定长点击 undefined;aria-pressed 两态。

## Comments

- 2026-11-16:用户同期报告「定长时输入框/标题被条目挤出、卡不能滚」——
  非代码缺陷,系 **dist 陈旧**:CRXJS dev 会话只把 JS 写入 dist、CSS 走
  HMR 内存注入,dev server 停后扩展加载「新 JS + 旧 CSS」,定长逻辑
  生效而 `[data-fixed-height]` flex 滚动样式缺失,内容溢出被卡面
  overflow:hidden 裁掉。修复:`npm run build` 重打完整生产 dist
  (dist/assets/index-*.css 27.5KB 含 flex 规则),扩展侧重载即可。
  静态 preview 构建上轮已验证 flex 布局/列表滚动/输入框贴底均正常。
