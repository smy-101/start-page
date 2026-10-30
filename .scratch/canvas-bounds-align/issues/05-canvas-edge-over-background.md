# 05 背景图下白板模式的画布边界可读性

Status: done

## 问题

用户反馈:换上自定义背景(GLOSSARY「背景」)后,白板模式下看不清画布边界。

根因:画布描边/点阵(canvas-bounds-align/03)是透明底上的低透明度墨线
(`--fg` 28% 虚线描边、14% 点阵、30% 拖柄胶囊),按纯色默认底(石墨/雾纸)
调的对比度;设背景后这层墨线直接叠在任意图片上,对比度不可控,边界消失。
右缘调宽拖柄(`.wb-resize`)同病。

## 方案

非锁定态画布(`.whiteboard-canvas:not([data-locked="true"])`)加磨砂底面:

- `background-color: color-mix(in srgb, var(--bg) 86%, transparent)`
- `backdrop-filter: blur(8px)`

性质:

- **默认底上是视觉无操作**:底色 86% 半透明叠在同色纯底上,合成结果与原底
  一致(实机逐像素 diff 仅 ±2/255 合成取整噪声,不可见)——默认观感零变化,不设
  背景的用户不受影响。
- **背景上凭空成立**:背景图/对比色上,画布浮出为一张半透明台面,虚线
  边界、点阵、拖柄、对齐辅助线全部恢复在纯底上调好的对比度;深浅色主题
  随 `--bg` 自适。
- 日常态(锁定)不加底面:页面保持干净,与「白板模式才是工作台」的语义
  一致。

## 验收(DoD)

- [x] 默认背景下,白板模式进出与改前视觉一致(±2/255 合成取整噪声,不可见)
- [x] 图片背景下,白板模式画布边界、点阵、右缘拖柄清晰可读(浅色 + 深色实机截图)
- [x] 深色主题同上
- [x] `npm run lint` / `typecheck` / `test` 全绿(346 例)
- [x] 截图存 `.scratch/canvas-bounds-align/shots/wb05/`

## Comments

- 2026-11-04 完成。落地:
  - CSS:`.whiteboard-canvas:not([data-locked])` 加 `background-color: color-mix(in srgb,
var(--bg) 86%, transparent)`;`backdrop-filter: blur(8px)` 单列一条规则,由
    `:root[data-start-background]` 门控。
  - App:背景 effect 同一分支同步维护 `<html>` 的 `data-start-background` 标记
    (设背景打上、进设置页/默认撤下);App.background.test 补 4 处断言。
  - 实测发现(方案迭代的根因):`backdrop-filter` 会把**整页**文字抗锯齿从
    子像素(ClearType)切到灰度——首版无条件磨砂在默认底下也切。故磨砂只在我
    设有背景时开;半透明底色保留无条件(合成上叠同色是恒等,实机对照截图
    逐像素 diff 仅 ±2/255 合成取整噪声,不可见)。
  - 实机验证(Windows Chrome + preview 单文件 harness,高频棋盘格 + 渐变合成
    压力图):
    - 压力图浅色/深色:画布浮出为台面,虚线边界墨点实测在位(顶边行
      min=367 vs 台面 ~675)、点阵 16px 周期可辨、拖柄可读;`backdrop-filter`
      对 `fixed` 背景在当前 Chromium 生效(台面内部均匀,无棋盘穿透)。
    - 默认底浅色/深色:与改前一致;`computed backdrop-filter` 为 none。
    - 对照照 `03-stress-light-before.png` 复现了用户反馈的原始问题。
  - 磨砂底面只在白板模式出现:日常态页面保持干净,与「白板模式才是工作台」
    语义一致。
