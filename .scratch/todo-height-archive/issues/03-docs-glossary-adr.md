# 03-docs:GLOSSARY 词条 + ADR-0006 第三补记

Status: done

## 事

Blocked by: 02

- `GLOSSARY.md`:
  - 「待办卡」:补「高可定长(缺省自适应),归档钮一键清除已完成条目
    (两模式可见)」;「待办卡宽」旁可增「待办卡高」词条(自由高、
    钳 [176, 720]、底缘拖调、缺省自适应)。
  - 「白板模式」:例外清单从「勾选/取消与添加」扩为
    「勾选/取消、添加与归档已完成」。
- `docs/adr/0006-*.md`:第三补记(todo-height-archive)——定长高退役
  「v1 无调高」隐含口径(锁白板,同调宽);归档 = 门禁第三洞
  (删条目本锁白板,归档是勾选消费的自然收尾,高频内容路径;引用
  todo-daily-add 补记的论证形状)。
- `.scratch/todo-height-archive/` 各票收尾(Status: done + Comments 落
  实测调校记录)。

## 验收

- 全量 vitest + eslint 通过。
- GLOSSARY Avoid 列表无冲突词条。

## Comments

- 2026-11-16:GLOSSARY 新增「待办卡高」「归档」词条,「待办卡」「白板模式」
  口径同步,「待办卡宽」Avoid 补交叉引用;ADR-0006 第三补记落
  docs/adr/0006-*.md 末尾。附带产物:vite.preview.config.ts(preview/
  harness 的独立静态构建入口,视觉评审/截图用——WSL 环境下 Windows
  Chrome 无法直达 dev server,构建产物拷 Windows 侧临时 HTTP 服务打开)。
