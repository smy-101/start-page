# 01: 扩展骨架 + 初始页空壳

**What to build:** 建立 Chromium MV3 扩展工程骨架:Vite + TypeScript + React + @crxjs/vite-plugin 2.x 打包,manifest 声明新标签页覆盖(`chrome_url_overrides.newtab`)与 favicon 权限,vitest 测试设施就绪。在 Chrome 中加载构建产物后,新标签页被中文「初始页」覆盖,显示空的收集箱分区,深浅色跟随系统。此票同时建立项目的测试与构建先例(spec 的 Testing Decisions 从这里开始生效)。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 构建命令产出的产物可在 Chrome 加载(含正确 manifest)
- [x] 加载后新标签页显示初始页,含空的收集箱分区,界面中文
- [x] 深浅色跟随系统自动切换
- [x] vitest 就绪且至少有一个真实测试在跑,测试命令与构建命令都进 package.json scripts
- [x] README(开发者视角)记录构建与加载步骤
- [x] 参照 spec: `.scratch/start-page/spec.md` 的 Implementation Decisions;术语见根目录 `GLOSSARY.md`

## Comments
- 2026-10-28: 已实现并合入 spec/start-page(merge commit 72c7596)。构建/测试通过;细节见 ticket/01-skeleton-newtab-shell 提交 27dd5b0..c988926。
