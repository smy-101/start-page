# Debugging & 视觉走查(WSL 环境)

本机调试与真机验证的流程与坑。环境拓扑决定的结论在配置文件里查不到,故记此。

## 环境拓扑(先读)

- `chrome-devtools` MCP 连的是 **Windows 侧 Chrome**;浏览器侧文件路径一律 Windows 格式。
- **Windows→WSL 网络不通**(localhost 转发、eth0 IP 直连均被挡);**WSL→Windows 可行**(`powershell.exe` 直接调)。
- 推论一:vite dev server 无法被 Windows Chrome 访问 → 视觉走查不走 dev server,走下方静态构建流程。
- 推论二:MCP 不能导航 `chrome://` URL → 扩展管理页(重载扩展)是人工步骤。

## 铁律:装进扩展的产物一律 `npm run build`

CRXJS dev 会话只把 **JS** 写入 `dist/`、**CSS 走 HMR 内存注入**——dev server 停掉后,扩展加载到「新 JS + 旧 CSS」。

- 症状特征:**新行为 + 旧样式混跑**(例:定长逻辑生效但滚动/布局样式缺失,内容被 `overflow:hidden` 裁掉)。第一时间 `ls -la dist/assets` 核对文件日期。
- 规则:改完代码 → `npm run build` → 人在 `chrome://extensions` 点刷新 → 再在扩展上验证。dev 会话留下的 `dist/` 不可当装机产物。

## 浏览器侧持久状态:观察前先排污染

- Edge 标签图标读本地 **Favicons 库**,不实时跟页面 `<link>` 声明;试验轮次写入的图标会当残影继续上屏,`?v=` 破缓存无效。涉及 favicon/标签图标的真机观察,先清库(步骤与根因全链路见 `.scratch/edge-compat/issues/02` 终局结论;Ctrl+Shift+R 按源码会标记过期重取,值得一试)。
- 症状疑为浏览器侧行为(单色遮罩、缓存库、固定占位图)时,先查官方故障排除文档与社区同症状报告再写码——edge-compat/01、02 的根因均迟到于方案落地。

## 视觉走查流程(静态构建 → Windows HTTP → MCP 断言)

1. `npx vite build --config vite.preview.config.ts`——`preview/` harness 含 chrome-shim + 内存存储 + 中文种子数据(场景卡在 `preview/main.tsx` 里按需增改),不依赖扩展 API。完成标准:产物出现在 `sp-preview-build/`。
2. 产物拷到 Windows 可见目录,并把 `scripts/serve-preview.ps1`(权威实现,带请求/错误日志)一并拷入;**拷文件,不要从文档转写**——转写笔误 + 空 catch 吞错曾把 1 秒的启动失败变成无限悬挂,症状是 curl 000 + CLOSE_WAIT 堆积:
   ```bash
   W=/mnt/c/Users/Lenovo/Downloads/sp-preview
   mkdir -p "$W"
   cp -r sp-preview-build/preview/index.html sp-preview-build/assets scripts/serve-preview.ps1 "$W"/
   powershell.exe -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\Lenovo\Downloads\sp-preview\serve-preview.ps1'"
   ```
   完成标准:探活返回 200。探活一律用 `curl.exe`(PS5 的 `Invoke-WebRequest` 无 `-UseBasicParsing` 时走 IE 解析会悬挂,别用);排障先读 `$W/serve.log`。
3. MCP `new_page` 打开 `http://127.0.0.1:8777/`,用 `evaluate_script` 做数值断言(几何、aria、点击回调)。完成标准:每个被测行为有一处断言输出。
4. 清理:杀 serve.ps1 宿主 + 删 `$W` 目录 + 删 WSL 侧 `sp-preview-build/` + 杀 WSL 侧残留 vite 进程(`ps aux | grep "[v]ite"`)。完成标准:8777 不再监听,`sp-preview-build/` 与 `$W` 均不存在。
   - **HttpListener 假 PID**:8777 的 LISTEN 归属是 PID 4(http.sys 内核代理),`Stop-Process` 杀不动 System——真正宿主是隐藏 powershell,按命令行找再杀;**查找命令自身的命令行含 `serve` 字样会自匹配**(多算 1 个,不是双宿主),排除自身或忽略末位:
     ```bash
     powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name like 'powershell%'\" | Where-Object { \$_.CommandLine -like '*serve*.ps1*' -and \$_.ProcessId -ne \$PID } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"
     ```
     一次杀出多个宿主属正常:上轮残留的死监听会被一并清掉。

## serve.ps1 模板

模板已升格为仓库文件 `scripts/serve-preview.ps1`(参数化端口/根目录、带 serve.log 请求与错误日志)。本节仅存档指向,勿在此转录副本——两份副本必漂移。

## evaluate_script 坑

- 调用必须带 `pageId`。
- React `useEffect` 挂 window 监听在 paint 之后:**同一同步块里连发 pointerdown/move/up 会丢事件**——派发之间 `await new Promise(r => setTimeout(r, 50))` 留间隔。
- 键盘/指针 handler 绑在柄元素(如 `tabIndex={0}` 的拖柄)而非卡容器:派发到容器是静默 no-op,状似功能坏了。**派发前先 grep 源码确认绑定目标**,别按容器猜。
- `getBoundingClientRect` 是视口相对坐标:**先滚动、后量测**,且对比的两侧矩形同帧量。
- `take_screenshot` 偶发超时;数值断言优先,截图是补充。

## 域内测试口径(引用,不展开)

jsdom 几何全 0 → 组件交互一律 delta 制(起点值 + 指针位移),真几何只在上述真机流程验。vitest 探针输出见 `CODING_STANDARDS.md`。
