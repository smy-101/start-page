// 生成扩展图标(PNG,manifest 仅支持位图)。零第三方依赖:手工编码 PNG + zlib。
// 运行:node scripts/generate-icons.mjs
// - icon-{16,32,48,128}.png   扩展图标:圆角晨曦渐变底(靛蓝→玫红→暖橙)+ 白色
//                              2×2 圆角瓷砖(Lucide layout-grid,ISC)—— 分组瓷砖是
//                              初始页产品形态本身即符号
// - outline-{16,32}.png       工具栏可收藏态(未收藏/已收藏同用):透明底 + 灰色瓷砖;
//                              已收藏的勾由 badge 叠加在右下角(类 AdGuard),不换图标本体
// - disabled-{16,32}.png      工具栏「不可收藏」态:浅灰瓷砖
// 光学矫正:Lucide 原味是 2/24 描边环,16px 下环孔(~1.2px)会被抗锯齿抹平,
// 故 16px 切换为同构图的实心瓷砖(标准 small-size 做法),≥32px 保持描边原味。
// 工具栏状态图标(outline/disabled)另写入 public/icons/:它们只被运行时
// setIcon 引用、不在 manifest 中;Vite 仅将 public/ 原样复制进 dist,
// 否则 dist/icons 缺文件导致 setIcon 404。
// 调试:ICONS_PREVIEW_SHEET=/tmp/sheet.png 可另出一张放大拼图供肉眼校验。
import { deflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "icons");
const publicIconsDir = join(rootDir, "public", "icons");

// —— PNG 编码 ——
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// —— 瓷砖字形几何 ——
// Lucide layout-grid(ISC,https://lucide.dev):24 viewBox 内四枚 7×7 圆角方
// (rx=1),坐标 (3,3) (14,3) (14,14) (3,14),原味 stroke-width 2。
// 映射进图标:字形占图标边长 GLYPH 比例,居中;g(u) 把 24 空间坐标映射到像素。
// 彩色态有渐变底撑满画布,62% 留白从容;工具栏是裸灰色字形,占太小学问是
// 「图标小」——按 Chrome 工具栏惯例(16dp 图标内容 ≈ 80%)放大,视觉重量对齐邻居。
const GLYPH_FILLED = 0.62;
const GLYPH_TOOLBAR = 0.88;
const STROKE_UNITS = 2; // Lucide 原味描边(24 空间)
const TILES = [
  [3, 3],
  [14, 3],
  [14, 14],
  [3, 14],
]; // (x, y),尺寸 7×7,rx=1

function glyphScale(size, glyph) {
  return (size * glyph) / 24;
}

function glyphMapper(size, glyph) {
  const scale = glyphScale(size, glyph);
  const inset = (size - size * glyph) / 2;
  return (u) => inset + u * scale;
}

// 圆角矩形有符号距离(px 空间):≤0 在形内;描边 = |d| ≤ 半宽
function sdRoundedRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

// 采样点到四枚瓷砖的覆盖判定;solid=true 实心(16px 光学矫正),否则描边环
function tileSample(x, y, size, glyph, solid, strokeWidth) {
  const g = glyphMapper(size, glyph);
  const scale = glyphScale(size, glyph);
  for (const [tx, ty] of TILES) {
    const cx = g(tx + 3.5);
    const cy = g(ty + 3.5);
    const d = sdRoundedRect(x, y, cx, cy, 3.5 * scale, 3.5 * scale, 1 * scale);
    if (solid ? d <= 0 : Math.abs(d) <= strokeWidth / 2) return true;
  }
  return false;
}

function insideRoundedRect(px, py, size, radius) {
  const x = Math.min(px, size - px);
  const y = Math.min(py, size - py);
  if (x >= radius || y >= radius) return x >= 0 && y >= 0;
  const dx = radius - x;
  const dy = radius - y;
  return dx * dx + dy * dy <= radius * radius;
}

// —— 晨曦渐变(自上而下:靛蓝夜空 → 玫红晨光 → 暖橙地平)——
const DAWN_STOPS = [
  [0.0, [30, 27, 75]], // #1e1b4b 靛蓝夜空
  [0.52, [194, 42, 104]], // #c22a68 玫红晨光
  [1.0, [249, 115, 22]], // #f97316 暖橙
];

function dawnColor(t) {
  if (t <= DAWN_STOPS[0][0]) return DAWN_STOPS[0][1];
  const last = DAWN_STOPS[DAWN_STOPS.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 1; i < DAWN_STOPS.length; i++) {
    const [t1, c1] = DAWN_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = DAWN_STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return [
        c0[0] + (c1[0] - c0[0]) * k,
        c0[1] + (c1[1] - c0[1]) * k,
        c0[2] + (c1[2] - c0[2]) * k,
      ];
    }
  }
  return last[1];
}

// —— 渲染(4x 超采样抗锯齿)——
const SS = 4;

// 彩色态:渐变底逐样本取色,瓷砖区域覆白;像素级平均兼顾渐变与抗锯齿
function renderFilled(size) {
  const solid = size < 32; // 16px 光学矫正:描边环 → 实心
  const strokeWidth = (size * GLYPH_FILLED * STROKE_UNITS) / 24;
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);
  const WHITE = [255, 255, 255];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!insideRoundedRect(x, y, size, radius)) continue;
          let [r, g, b] = dawnColor(y / size);
          if (tileSample(x, y, size, GLYPH_FILLED, solid, strokeWidth)) {
            [r, g, b] = WHITE;
          }
          rSum += r;
          gSum += g;
          bSum += b;
          hit++;
        }
      }
      if (hit === 0) continue;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(rSum / hit);
      rgba[i + 1] = Math.round(gSum / hit);
      rgba[i + 2] = Math.round(bSum / hit);
      rgba[i + 3] = Math.round((255 * hit) / (SS * SS));
    }
  }
  return rgba;
}

// 描边态:透明底 + 灰色瓷砖(同构图,16px 同样切实心);字形 80% 撑满工具栏
function renderGlyph(size, color) {
  const solid = size < 32;
  const strokeWidth = (size * GLYPH_TOOLBAR * STROKE_UNITS) / 24;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (tileSample(x, y, size, GLYPH_TOOLBAR, solid, strokeWidth)) hit++;
        }
      }
      if (hit === 0) continue;
      const i = (py * size + px) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = Math.round((255 * hit) / (SS * SS));
    }
  }
  return rgba;
}

// —— 调试拼图(可选):小图放大最近邻,肉眼校验 16px 可读性 ——
function writePreviewSheet(entries, path) {
  const PAD = 20;
  const GAP = 14;
  const bg = [182, 188, 196];
  const rows = [entries.slice(0, 4), entries.slice(4)];
  const rowH = rows.map((row) =>
    Math.max(...row.map(({ size, scale }) => size * scale))
  );
  const width =
    PAD * 2 +
    Math.max(
      ...rows.map((row) =>
        row.reduce((acc, { size, scale }) => acc + size * scale + GAP, -GAP)
      )
    );
  const height = PAD * 2 + rowH[0] + 24 + rowH[1];
  const sheet = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    sheet[i * 4] = bg[0];
    sheet[i * 4 + 1] = bg[1];
    sheet[i * 4 + 2] = bg[2];
    sheet[i * 4 + 3] = 255;
  }
  let y0 = PAD;
  for (const [rowIdx, row] of rows.entries()) {
    let x0 = PAD;
    for (const { size, scale, rgba } of row) {
      for (let y = 0; y < size * scale; y++) {
        for (let x = 0; x < size * scale; x++) {
          const s = (Math.floor(y / scale) * size + Math.floor(x / scale)) * 4;
          const d = ((y0 + y) * width + x0 + x) * 4;
          const a = rgba[s + 3] / 255;
          sheet[d] = Math.round(rgba[s] * a + bg[0] * (1 - a));
          sheet[d + 1] = Math.round(rgba[s + 1] * a + bg[1] * (1 - a));
          sheet[d + 2] = Math.round(rgba[s + 2] * a + bg[2] * (1 - a));
        }
      }
      x0 += size * scale + GAP;
    }
    y0 += rowH[rowIdx] + 24;
  }
  writeFileSync(path, encodePng(width, height, sheet));
}

// —— 输出 ——
const GRAY = [95, 99, 104]; // #5f6368 工具栏中性灰(未收藏描边)
const GRAY_DISABLED = [179, 185, 194]; // #b3b9c2 浅灰(不可收藏,与未收藏拉开明度差)

mkdirSync(outDir, { recursive: true });
// 渲染全部位图一次(拼图与 PNG 输出共用,不在输出映射里夹副作用)
const buffers = new Map();
for (const [key, size, render] of [
  ...[16, 32, 48, 128].map((s) => [`icon-${s}`, s, () => renderFilled(s)]),
  ...[16, 32].map((s) => [`outline-${s}`, s, () => renderGlyph(s, GRAY)]),
  ...[16, 32].map((s) => [
    `disabled-${s}`,
    s,
    () => renderGlyph(s, GRAY_DISABLED),
  ]),
]) {
  buffers.set(key, { size, rgba: render() });
}
const outputs = [...buffers].map(([key, { size, rgba }]) => [
  `${key}.png`,
  encodePng(size, size, rgba),
]);
for (const [name, png] of outputs) writeFileSync(join(outDir, name), png);

// 工具栏状态图标同步写入 public/icons(见文件头注释)
mkdirSync(publicIconsDir, { recursive: true });
for (const name of [
  "outline-16.png",
  "outline-32.png",
  "disabled-16.png",
  "disabled-32.png",
]) {
  writeFileSync(join(publicIconsDir, name), readFileSync(join(outDir, name)));
}

// 调试拼图(显式指定路径才生成)
const sheetPath = process.env.ICONS_PREVIEW_SHEET;
if (sheetPath) {
  writePreviewSheet(
    [
      ["icon-128", 1],
      ["icon-48", 2],
      ["icon-32", 4],
      ["icon-16", 4],
      ["outline-32", 4],
      ["outline-16", 4],
      ["disabled-32", 4],
      ["disabled-16", 4],
    ].map(([key, scale]) => ({
      size: buffers.get(key).size,
      scale,
      rgba: buffers.get(key).rgba,
    })),
    sheetPath
  );
}

console.log(
  `生成 ${outputs.length} 个图标 → icons/(工具栏状态图标另同步 public/icons/)`
);
