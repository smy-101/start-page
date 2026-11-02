# 02 白板 UI:拖柄自由宽 + 徽标 px + 文档

Status: done
Type: task
Blocked by: 01

GroupSection:渲染宽 `groupWidthPxOf(group)`;拖柄配置换轨 useAxisResize
px 域(min 222 / max = 画布宽,松手 snapGrid 16px 吸附、键盘 stepGrid 一格);
回流哨兵盯 width(快照 {atWidth, atColumns});徽标「N px」,清单式
(显式条数 < 装满)附「· 一行 M 条」;aria-valuenow/min/max/text 全 px
(同待办卡)。onResizeSpan → onResizeWidth(id, width)。

Whiteboard:widthOf 分组支改 groupWidthPxOf;`resizeMaxW = canvasW`
(替代 maxSpanForCanvas);onResizeGroup 签名 (id, width)。
App:handleResizeGroup → store.setGroupWidth。

CSS:无改动(拖柄/徽章样式复用)。

文档:GLOSSARY(组宽档位 → 组宽词条改写、每行条数/画布/分组联动)、
ADR-0007(决策记录)+ ADR-0005 取代注、types.ts 版本注释、preview 种子
g-tools 换 width: 792。

验收:组件测试全绿;tsc/eslint/build 干净;preview 真机走查断言过
(连续预览/吸附/键盘/表单保宽/清单式网格)。

## Comments

- 评审收尾(命名跟随 GLOSSARY):index.css 分组卡头注释、useAxisResize
  文档注释两处「档位」残留改自由宽口径;GLOSSARY「组宽」错字铇→钳、
  「每行条数」徽标句自相矛盾(旧句主语「宽 N 列」已删,「非指本词条」
  残留)改写。
