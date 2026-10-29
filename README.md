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

## 安装(加载 dist)

1. `npm install && npm run build`
2. 打开 `chrome://extensions`,右上角开启「开发者模式」
3. 点击「加载已解压的扩展程序」,选择本仓库的 **`dist/`** 目录
4. 打开新标签页 → 显示「初始页」即安装成功。首次安装 Chrome 可能弹「改回 Google?」,选择「保持现状」保留新标签页覆盖
5. 代码更新后重新 `npm run build`,再到 `chrome://extensions` 点扩展卡片上的刷新按钮

注意:Chrome 品牌版 137+ 已禁用 `--load-extension` 启动参数,加载一律走 chrome://extensions 页面。
`npm run dev` 模式下产物指向本机 dev server,需保持 vite 进程运行,首次加载方式同上。

界面中文;深浅色跟随系统(CSS 变量 + `prefers-color-scheme`)。数据仅存本地 `chrome.storage.local`。

## 功能使用

### 收藏:三个入口

- **初始页表单**:顶部「网址 / 标题 / 备注」填写后「添加收藏」,缺省进收集箱;网址自动规范化(缺协议补 https、去尾斜杠),标题留空自动取主机名
- **工具栏一键收藏**:在任意网页点扩展图标,当前页连同页面标题一键进收集箱。图标三态:空心 = 未收藏,实心勾 = 已收藏(再点即取消),× 徽标 = chrome:// 等无法收藏的页面
- **右键菜单**:页面空白处右键 →「初始页 → 收藏到 → 选择分组」直接入组;已收藏时菜单变「取消收藏」;对已收藏页面再「收藏到」其他分组即换组

### 分组管理

- 新建分组:「分组名 + 色点」表单,颜色即时可选
- 改名 / 换色:分组标题旁「编辑分组」
- 拖拽整理:拖分组标题调整组间顺序;拖卡片做组内排序或跨组移动
- 折叠 / 展开:分组标题箭头,折叠状态刷新后保持
- 删除分组:组内收藏自动移入收集箱、不会丢失,删除前有确认提示

### 搜索

顶部搜索框输入即过滤:标题与网址全文匹配,无匹配内容的分组自动隐藏,全部无匹配时显示空状态。回车用所选搜索引擎在新标签页搜索输入词。

### 设置(右上角齿轮)

- **搜索引擎**:Google / 必应 / 百度(默认必应),选择即保存
- **从浏览器书签导入**:一键把浏览器书签并入初始页——顶层文件夹转为分组、书签栏散项进收集箱、重复网址自动跳过,完成后给出「新增 N 条、跳过 M 条」统计
- **导出 JSON**:完整无损备份,分组颜色与顺序、收藏备注逐字保留;配合「替换全部」导入可整库迁移
- **导出 HTML**:Netscape 书签格式,可供 Chrome 等浏览器的原生书签管理器导入
- **导入文件**:JSON 可选「合并(跳过重复)」或「替换全部」;HTML 书签文件始终按合并导入

完整冒烟测试记录见 [docs/smoke-2026-10-28.md](docs/smoke-2026-10-28.md)。

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
