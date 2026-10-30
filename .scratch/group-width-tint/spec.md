# 分组调宽多列 + 去色脊淡染托盘(group-width-tint)

Status: done
用户两条诉求(grilling 四问定案,2026-12):

1. **分组宽度可调、一行多条书签**:每组卡右缘拖柄调宽(白板模式内),
   组内书签从单列长条改为**横条自动换行网格**(图标+标题横条不变);
   组头「编辑」表单同时提供**每行条数**直接选择(1–6)。
   默认(未调过)保持现状单列宽行观感——拉宽才出多列。
2. **去左缘色脊,整组淡染**:删 `.group::before` 色脊柱;托盘底染约 8–10%
   组色、边框微带色,组头色点继续承担识别;自定义图片背景下整组变
   半透明磨砂玻璃(同画布磨砂口径),深浅色自动适配。

## 定案(grilling 记录)

- 调宽交互:每组右缘拖柄(非画布级、非全局、非仅表单)。
- 卡片形态:横条自动换行(竖排瓦片方案弃)。
- 底色浓度:淡染玻璃(明显色块/纯中性弃)。
- 默认列数:单列宽行保持,拉宽出多列;另给「每行条数」显式选择。

## 模型(schema v6)

- `Group.columns?: number`,**每行条数**,缺省 = 1 = 现状宽行单列。
- 组宽纯推导,不存 px:`groupWidthOf(columns)`:
  - c=1 → `CARD_W`(389.33,存量观感逐字不变);
  - c≥2 → `38 + c×184 + (c−1)×6`(border 1×2 + 组横 padding 16 + 网格横
    padding 8 + 滚动槽 12[Windows thin 实测 10,`scrollbar-gutter: stable`
    常驻预留,不预留则内容滚出时塌列];格宽 184 = CSS `minmax(184px, 1fr)`
    同一口径)。
  - W(2)=412、W(3)=614、W(4)=816、W(5)=1018、W(6)=1220,列数上限 6
    (W(6) 需画布 ≥ 1220;默认画布 1200 最多 5 列,宽画布才到 6)。
- 拖柄松手**吸附列边界**(`nearestGroupColumns`:最近 W(c),非 16px 网格);
  键盘 ←/→ 步进一列。
- 画布互钳:`maxColumnsForCanvas(canvasW)` = 界内放得下的最大列数;
  `setCanvasWidth` 缩宽时超宽组降列 + 按各自宽重钳 x(与既有重钳同口径)。
- 迁移 v5→v6:无数据回填;仅剥离非法 columns(非整数/越界)。
- 导入:`isGroupShape` 放行可选 columns(给了必须是数字);
  `restoreFrom` 按组宽钳 x、超宽降列。

## 布局算法

- 组内网格:`.group-grid` 改 `display: grid;
  grid-template-columns: repeat(auto-fill, minmax(184px, 1fr))`。
  W(1) 内宽 363 < 366(两格下限)→ 单列;W(c) 内宽恰装 c 格。
- `packCanvas` 宽度感知:卡位槽仍按 `CARD_W+GAP` 间距列分配,占
  `k = ceil((W+GAP)/(CARD_W+GAP))` 个连续槽,取「组顶最高槽」最小的窗口
  (平手靠左),组在槽跨度内**居中**落 x;k=1 时与旧行为逐字一致
  (1 槽跨度恰 = CARD_W)。签名加可选 `widths`,缺省全 CARD_W,旧调用不动。

## 交互细节

- 拖柄:组右缘内侧 14px 热区,`ew-resize`,白板模式且非搜索、非折叠才渲染;
  `pointerdown` stopPropagation(不劫持分组移动会话);拖中宽度连续预览
  (delta 制,不依赖 rect,jsdom 可测),松手吸附列边界写回 store,
  已提交宽留到持久回流再清(同画布 canvasOverride 口径,免闪回)。
- 表单「每行条数」:1–6 下拉,与改名/换色同表单提交;收集箱表单不出现
  (拖柄仍可调,仅改名/换色/选列数对收集箱关)。

## 样式

- 删 `.group::before` 色脊柱。
- 托盘:`background: color-mix(in srgb, var(--group-color) 8%, var(--tray))`;
  边框 `color-mix(组色 18%, var(--border))`;dragover 高亮维持组色 55% 口径。
- `:root[data-start-background]` 下组托盘半透明磨砂:
  `color-mix(组色 9%, color-mix(var(--bg) 72%, transparent))` +
  `backdrop-filter: blur(8px)`(与画布磨砂同强度;日常态画布无底色,
  组托盘自己磨砂保证图上可读)。
- 网格随宽自适应;`.drop-indicator`/`.card-editing` 跨全行(`1 / -1`);
  `.card` 补 `min-width: 0`(格内截断)。

## 工单

- `issues/01-domain-columns.md` 几何 + schema + 迁移 + store
- `issues/02-whiteboard-resize.md` 拖柄 + 列数选择 + 宽度入渲染/拖拽几何
- `issues/03-style-tray-tint.md` 去色脊 + 淡染玻璃 + 网格样式 + 视觉走查

## 文档收尾

- GLOSSARY「画布」的「卡宽不随画布宽拉伸(全局常量)」口径更新为
  「卡宽随每行列数推导(schema v6)」;新增「每行条数」词条。
- ADR-0004 补记(group-width-tint):卡宽常量退役为「单列基准宽」,
  组宽 = 每行条数推导,装箱宽度感知。

## Comments

- 2026-12 实现:三票全部落地,测试全绿(tsc/eslint 干净)。
  实测口径:W(1)=389.33、W(2)=412、W(3)=602、W(4)=792、W(5)=982、W(6)=1172
  (滚动槽 12px 计入推导后;首版 26px 口径漏了滚动条塌列隐患,preview 实测修正;
  本行 614/816/1018/1220 为当时笔误,group-span-decouple code-review 时订正)。
  视觉走查(preview,Windows Chrome):浅色淡染/深色微彩边/图片背景磨砂玻璃
  三态可读;真实拖柄会话预览 639px → 松手吸附 590px(3 列)与徽标读数正常。
