import { GROUP_COLOR_PALETTE } from "./colors";

type ColorSwatchesProps = {
  /** 同页多个色板(新建表单/各分组表头)需互不干扰的 radio 组名 */
  name: string;
  value: string;
  onChange: (color: string) => void;
  /** 色板组的可访问名(缺省「分组颜色」;待办卡色板传自己的名) */
  label?: string;
};

/** 色板选择器:单选色点,新建分组与分组换色、待办卡换色共用。 */
export function ColorSwatches({
  name,
  value,
  onChange,
  label = "分组颜色",
}: ColorSwatchesProps) {
  return (
    <div className="color-swatches" role="radiogroup" aria-label={label}>
      {GROUP_COLOR_PALETTE.map((color) => (
        <label
          key={color}
          className="color-swatch"
          data-selected={color === value}
        >
          <input
            type="radio"
            name={name}
            value={color}
            checked={color === value}
            onChange={() => onChange(color)}
            aria-label={`颜色 ${color}`}
          />
          <span className="color-dot" style={{ backgroundColor: color }} />
        </label>
      ))}
    </div>
  );
}
