# 01: 扩展骨架 + 初始页空壳

**What to build:** 建立 Chromium MV3 扩展工程骨架:Vite + TypeScript + React + @crxjs/vite-plugin 2.x 打包,manifest 声明新标签页覆盖(`chrome_url_overrides.newtab`)与 favicon 权限,vitest 测试设施就绪。在 Chrome 中加载构建产物后,新标签页被中文「初始页」覆盖,显示空的收集箱分区,深浅色跟随系统。此票同时建立项目的测试与构建先例(spec 的 Testing Decisions 从这里开始生效)。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 构建命令产出的产物可在 Chrome 加载(含正确 manifest)
- [ ] 加载后新标签页显示初始页,含空的收集箱分区,界面中文
- [ ] 深浅色跟随系统自动切换
- [ ] vitest 就绪且至少有一个真实测试在跑,测试命令与构建命令都进 package.json scripts
- [ ] README(开发者视角)记录构建与加载步骤
- [ ] 参照 spec: `.scratch/start-page/spec.md` 的 Implementation Decisions;术语见根目录 `GLOSSARY.md`

## Comments
