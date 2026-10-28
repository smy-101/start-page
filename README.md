# start-page(项目名暂定)

一个 Chromium (MV3) 浏览器扩展:把新标签页覆盖为「初始页」——收藏按分组分区展示、搜索直达、数据可导入导出。仅支持 Chrome/Edge。

术语见 [GLOSSARY.md](GLOSSARY.md);架构决策见 [docs/adr/](docs/adr/)。

## 常用命令

环境要求:Node ≥ 22.22.2(建议 24 LTS)。

```bash
npm install        # 安装依赖
npm run dev        # Vite 开发模式(@crxjs HMR)
npm test           # vitest,单次运行全部测试
npm run typecheck  # tsc --noEmit
npm run build      # 构建可加载的扩展产物到 dist/
```

## 在 Chrome 中加载(开发调试)

1. `npm run build`
2. 打开 `chrome://extensions`,右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」,选择本仓库的 **`dist/`** 目录
4. 打开新标签页 → 应显示「初始页」:可向收集箱添加/编辑/删除收藏、新建分组并拖拽整理(组间排序、组内排序、跨组移动、折叠展开、删除分组自动回收进收集箱),点击卡片打开网页
5. 代码更新后重新 `npm run build`,再到 `chrome://extensions` 点扩展卡片上的刷新按钮

注意:Chrome 品牌版 137+ 已禁用 `--load-extension` 启动参数,加载一律走 chrome://extensions 页面。
`npm run dev` 模式下产物指向本机 dev server,需保持 vite 进程运行,首次加载方式同上。

界面中文;深浅色跟随系统(CSS 变量 + `prefers-color-scheme`)。

## 目录结构

```
manifest.config.ts            # MV3 manifest(defineManifest)
src/domain/                   # 领域层:纯 TypeScript,零 chrome.* 依赖,存储适配器注入
src/storage/                  # 存储适配器:chrome.storage.local 真实实现 + 内存实现(测试)
src/newtab/                   # 新标签页「初始页」React 应用
src/background/               # MV3 service worker:工具栏一键收藏接线(index.ts 汇聚入口)
tests/fixtures/               # 测试样本(真实形态的浏览器书签导出 HTML 等)
icons/                        # 扩展图标(PNG,manifest 仅支持位图)
public/icons/                 # 仅运行时 setIcon 引用的工具栏状态图标,Vite 原样复制进 dist
scripts/generate-icons.mjs    # 图标生成脚本:node scripts/generate-icons.mjs
```
