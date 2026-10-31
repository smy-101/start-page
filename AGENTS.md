# 初曦(start-page)

一个 Chromium (MV3) 浏览器扩展:**初曦** —— 把新标签页覆盖为「初始页」,收藏按分组分区展示、搜索直达、数据可导入导出。仅支持 Chrome/Edge。

## Agent skills

### Issue tracker

Issues 以本地 Markdown 文件跟踪,位于 `.scratch/<feature-slug>/`。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用默认五标签:needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix。见 `docs/agents/triage-labels.md`。

### Domain docs

单语境:根目录 `GLOSSARY.md` + `docs/adr/`。见 `docs/agents/domain.md`。

### Debugging & 视觉走查

视觉走查/真机验证走「静态构建 → Windows HTTP → MCP 断言」流程;扩展装新产物一律先 `npm run build`(dev 会话的 dist 是陈旧产物);「新行为 + 旧样式混跑」症状 = dist 陈旧。见 `docs/agents/debugging.md`。
