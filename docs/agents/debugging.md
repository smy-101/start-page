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

## 视觉走查流程(静态构建 → Windows HTTP → MCP 断言)

1. `npx vite build --config vite.preview.config.ts`——`preview/` harness 含 chrome-shim + 内存存储 + 中文种子数据(场景卡在 `preview/main.tsx` 里按需增改),不依赖扩展 API。完成标准:产物出现在 `sp-preview-build/`。
2. 产物拷到 Windows 可见目录,并写入静态服务脚本(模板见下):
   ```bash
   W=/mnt/c/Users/Lenovo/Downloads/sp-preview
   mkdir -p "$W"
   cp -r sp-preview-build/preview/index.html sp-preview-build/assets "$W"/
   # serve.ps1 模板写入 $W/serve.ps1(见下节)
   powershell.exe -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\Lenovo\Downloads\sp-preview\serve.ps1'"
   ```
   完成标准:`powershell.exe` 侧 `Invoke-WebRequest http://127.0.0.1:8777/` 返回 200。
3. MCP `new_page` 打开 `http://127.0.0.1:8777/`,用 `evaluate_script` 做数值断言(几何、aria、点击回调)。完成标准:每个被测行为有一处断言输出。
4. 清理:kill 8777 监听进程 + 删 `$W` 目录 + 杀 WSL 侧残留 vite 进程(`ps aux | grep "[v]ite"`)。完成标准:8777 不再监听。

## serve.ps1 模板

```powershell
$root = "C:\Users\Lenovo\Downloads\sp-preview"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8777/")
$listener.Start()
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path -replace "/", "\")
    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $mime = switch ([IO.Path]::GetExtension($file)) {
        ".html" {"text/html"} ".js" {"text/javascript"} ".css" {"text/css"}
        ".svg" {"image/svg+xml"} ".png" {"image/png"} default {"application/octet-stream"}
      }
      $ctx.Response.ContentType = $mime
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $ctx.Response.StatusCode = 404 }
    $ctx.Response.Close()
  } catch { }
}
```

## evaluate_script 坑

- 调用必须带 `pageId`。
- React `useEffect` 挂 window 监听在 paint 之后:**同一同步块里连发 pointerdown/move/up 会丢事件**——派发之间 `await new Promise(r => setTimeout(r, 50))` 留间隔。
- `getBoundingClientRect` 是视口相对坐标:**先滚动、后量测**,且对比的两侧矩形同帧量。
- `take_screenshot` 偶发超时;数值断言优先,截图是补充。

## 域内测试口径(引用,不展开)

jsdom 几何全 0 → 组件交互一律 delta 制(起点值 + 指针位移),真几何只在上述真机流程验。vitest 探针输出见 `CODING_STANDARDS.md`。
