# 视觉走查静态服务(debugging.md「视觉走查流程」第 2 步的权威实现)。
# 拷贝/引用本文件,不要从文档转写——转写笔误 + 空 catch 吞错曾把
# 1 秒的启动失败变成无限悬挂(2026-10-31 retro)。
#
# 用法(WSL 侧启动隐藏宿主):
#   powershell.exe -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\<用户>\Downloads\sp-preview\serve-preview.ps1'"
# 服务根目录默认脚本所在目录;端口默认 8777,可用 -Port 换。
# 每个请求/错误追加日志到同目录 serve.log——排障先看它,别猜。

param(
  [int]$Port = 8777,
  [string]$Root = $PSScriptRoot
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Add-Content (Join-Path $Root "serve.log") "started port=$Port root=$Root"
while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $Root ($path -replace "/", "\")
    if (Test-Path $file -PathType Leaf) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $mime = switch ([IO.Path]::GetExtension($file)) {
        ".html" {"text/html"} ".js" {"text/javascript"} ".css" {"text/css"}
        ".svg" {"image/svg+xml"} ".png" {"image/png"} default {"application/octet-stream"}
      }
      $ctx.Response.ContentType = $mime
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      Add-Content (Join-Path $Root "serve.log") "404 $path"
    }
    $ctx.Response.Close()
  } catch {
    # 不吞错:每请求异常落盘,悬挂立即变可见
    Add-Content (Join-Path $Root "serve.log") "err: $($_.Exception.Message)"
  }
}
