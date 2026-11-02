# group-width-free:收藏组自由宽(档位制退役)

Status: done
ADR: [0007](../../docs/adr/0007-group-free-width.md)

## 背景

组宽自 schema v7 起为 1–6 档位(group-span-decouple):拖柄松手吸附档位
边界、键盘步进一档。用户定案:**改为与待办卡宽(v10)一致的自由宽**——
拖右缘连续调宽、松手 16px 网格吸附、键盘 ←/→ 步进一格、徽标/aria 报 px。

## 决策

- `Group.width?: number`(px,schema v12→v13);缺省 = 从每行条数推导装满
  (v12 存量零改写);v7–v12 备份的 span 按旧档位数学换算为 px,渲染逐字不变。
- 界限:铇 [222, 2400] 且不越画布宽;下限 222 = groupWidthOf(1) 单格恰装;
  上界随画布宽收窄(同待办卡)。吸附/步进对齐只在组件,store 只管界限。
- ADR-0005 用户决策保留:拖窄装不下时每行条数自动跟降;表单改条数
  组宽只升不降(抬宽基准 = 装满条数的宽)。
- 缺省装满 = `groupCellsForWidth(width)`(`groupWidthOf` 的逆);显式条数
  防御铇 ≤ 装满(手改 JSON 兕底);宽缺省时条数即推导源,不铇。

## 验收

- 域层:canvas/migrations/store/importExport 测试全绿(537 项全量);
  v12→v13 换算/零改写/残遗剥离、setGroupWidth 铇界同义、缩画布收窄、
  导入 replace 换算收窄各有用例。
- UI:GroupSection 拖柄 px 化(徽标「N px[ · 一行 M 条]」、aria px);
  Whiteboard resizeMaxW = 画布宽。
- 真机走查(preview 静态构建 + MCP 断言):六组渲染宽正确(含清单式
  792/repeat(1));拖 602→812 连续预览、松手吸附 816;徽标清单式标注;
  键盘 816→832→816;表单改一行 1 条宽保持 816、网格 repeat(1)。

## Issues

- [01 领域层:自由宽](issues/01-domain-free-width.md)
- [02 UI 层:拖柄 px 化](issues/02-ui-free-width.md)
