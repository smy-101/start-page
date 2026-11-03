# start-page-inbox MCP

「初曦」收集箱只读 MCP server。扫描本机所有 Chromium 浏览器(Edge/Chrome/Brave/Vivaldi/Chromium/Opera)profile 的 `Local Extension Settings`(chrome.storage.local 的 LevelDB 落盘),按**数据形状**(`state` 键可解析且含 `inbox` 分组)识别初曦数据,取 **mtime 最新**的一份——自动跟随当前活跃浏览器,无需调试端口(Chrome 136+ 也不允许)、无需扩展配合、浏览器运行中可读。

## 工具

| 工具             | 用途                                                       |
| ---------------- | ---------------------------------------------------------- |
| `get_inbox`      | 收集箱全部收藏(标题/URL/备注/顺序)+ 数据时间戳与过期小时数 |
| `get_full_state` | 整个看板:分组统计、全部收藏(剥 icon)、待办卡               |
| `list_sources`   | 所有识别到的数据源(浏览器/profile/mtime/规模),装机排查用   |

## 安装(WSL)

```bash
cd scripts/inbox-mcp && npm install
pi mcp add -l start-page-inbox -- node "$PWD/server.mjs"
```

已登记在本仓 `.pi/mcp.json`(项目级),信任本项目的 pi 会话自动连接。

## 不经 MCP 直接用

```bash
node scripts/inbox-mcp/cli.mjs           # 收集箱视图
node scripts/inbox-mcp/cli.mjs full      # 全量看板
node scripts/inbox-mcp/cli.mjs sources   # 数据源列表
```

## 设计备注

- **不按扩展 id 认目录**:unpacked 扩展 id 随安装路径/浏览器变化,同目录混装其他扩展(实测 Chrome 里同位置是个 Bing 推广扩展)会被形状校验天然排除。
- **拷 /tmp 再只读打开**:避开浏览器持锁与 drvfs 写语义;LevelDB log 尾部撕裂属正常容错路径,读失败静默跳过该候选。
- 依赖 `classic-level`(带 prebuild,无需编译脚本);SDK 走 stdio 传输。
- 数据是快照口径:`staleHours` 提示新鲜度;浏览器写存储后 mtime 即更新,下次调用取到新值。
