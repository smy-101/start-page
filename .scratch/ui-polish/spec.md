# ui-polish(组色表达收敛 + 画布高同帧回流)

Status: done

来源:group-width-tint 落地后的观感反馈续批 + 画布高闪烁实测。

## 定案

- 组头色点退役:组头视觉过重(折叠钮+色点+名字+计数),组色改由
  托盘底染(8%→16%)+边框(18%→30%)独立承担;底色进 160ms 过渡,
  换色前后差异可感。
- 折叠钮静音化:箭头 14→12px,静息墨色降至 55% 透明,悬停/聚焦恢复。
- 色板 8→12 色(补暖橙/湖蓝/桃粉/靛蓝四个色环缺口),存量分组色不受影响。
- 配套全局调校:r-lg 14→16px(组托盘/对话框/设置分区等大面统一柔角);
  图标钮静息底改透明(托盘淡染上不浮白片,悬停才显)。
- collapse-canvas-sync:同步量高扩为每次提交后都量(useCardRegistry
  三条腿),底缘组折叠/展开画布高当帧回流,不闪旧边界——RO 的 setState
  在绘制后才提交,赶不上这一帧。

## 验收

- vitest 402 全绿(含 GroupCollapse.test.tsx 新回归测试);lint/typecheck 干净。
- 冒烟截图 7 张(.scratch/ui-polish/):浅/深色 wide、narrow、settings×2、
  换色表单×2(色板 12 色、选中环可见、底染浅深色均可感)。
- code-review 两轴收尾:P1 键盘聚焦恢复补 `.collapse-toggle:focus-visible`;
  口径订正:colors.ts Tomorrow 声称弱化、index.css 圆角分级/分区横幅注释、
  CODING_STANDARDS「同步量高」改三条腿口径、ADR-0004 补记补两项全局调校。
