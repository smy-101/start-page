# 06 空状态「从浏览器书签导入」CTA

Status: done

## 问题

「从浏览器书签导入」只在设置页,新用户初始化困难(反馈 #6;功能本身已存在)。

## 方案

- 复用 `isFreshInstallState`(仅收集箱、零收藏):初始页中部空状态卡
  「把浏览器书签导进来」大按钮 + 次要按钮「手动添加」(打开 + 弹窗)。
- 导入走与设置页同一 `importNativeBookmarks` 管线,完成后报告新增/跳过数。
- 导入后空状态自然消失(不再是 fresh 态)。

## 验收

- fresh 态显示 CTA;导入成功后消失;非 fresh 态不显示。
- `npm test`、typecheck 过。

## Comments

- 2026-10-29 实现:ImportCta 组件置于看板上方(fresh 态),不堵编辑/建组路径;
  与设置页共用 importNativeBookmarks 管线,导入后报告统计并自然消失。
