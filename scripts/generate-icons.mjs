// 生成扩展图标(PNG,manifest 仅支持位图)。零第三方依赖:手工编码 PNG + zlib。
// 运行:node scripts/generate-icons.mjs
// - icon-{16,32,48,128}.png   扩展图标:圆角靛蓝底 + 白色书签丝带
// - outline-{16,32}.png       工具栏可收藏态(未收藏/已收藏同用):透明底 + 灰色书签描边;
//                              已收藏的勾由 badge 叠加在右下角(类 AdGuard),不换图标本体
// - disabled-{16,32}.png      工具栏「不可收藏」态:浅灰书签描边
// 工具栏状态图标(outline/disabled)另写入 public/icons/:它们只被运行时
// setIcon 引用、不在 manifest 中;Vite 仅将 public/ 原样复制进 dist,
// 否则 dist/icons 缺文件导致 setIcon 404。
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

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// —— 几何 ——
// 书签丝带多边形(单位坐标,y 向下)
const BOOKMARK = [
  [0.3, 0.14],
  [0.7, 0.14],
  [0.7, 0.86],
  [0.5, 0.66],
  [0.3, 0.86],
];

function insidePolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPolygonEdge(poly, px, py) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(
      d,
      distToSegment(px, py, poly[i][0], poly[i][1], poly[j][0], poly[j][1])
    );
  }
  return d;
}

function insideRoundedRect(px, py, size, radius) {
  const x = Math.min(px, size - px);
  const y = Math.min(py, size - py);
  if (x >= radius || y >= radius) return x >= 0 && y >= 0;
  // 距圆角圆心 (radius, radius) 的距离:原实现误算成距角点距离,四角呈带凹缺的直角
  const dx = radius - x;
  const dy = radius - y;
  return dx * dx + dy * dy <= radius * radius;
}

// —— 渲染(4x 超采样抗锯齿)——
const SS = 4;

function renderFilled(size, bg, fg) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.22);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHit = 0;
      let fgHit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!insideRoundedRect(x, y, size, radius)) continue;
          bgHit++;
          if (insidePolygon(BOOKMARK, x / size, y / size)) fgHit++;
        }
      }
      if (bgHit === 0) continue;
      const i = (py * size + px) * 4;
      const bgCov = bgHit / (SS * SS);
      const fgMix = fgHit / bgHit; // 书签在底色中的占比
      rgba[i] = Math.round(bg[0] * (1 - fgMix) + fg[0] * fgMix);
      rgba[i + 1] = Math.round(bg[1] * (1 - fgMix) + fg[1] * fgMix);
      rgba[i + 2] = Math.round(bg[2] * (1 - fgMix) + fg[2] * fgMix);
      rgba[i + 3] = Math.round(255 * bgCov);
    }
  }
  return rgba;
}

function renderOutline(size, stroke) {
  const rgba = Buffer.alloc(size * size * 4);
  const w = Math.max(1.25, size / 8);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (distToPolygonEdge(BOOKMARK, x / size, y / size) * size <= w)
            hit++;
        }
      }
      if (hit === 0) continue;
      const i = (py * size + px) * 4;
      rgba[i] = stroke[0];
      rgba[i + 1] = stroke[1];
      rgba[i + 2] = stroke[2];
      rgba[i + 3] = Math.round((255 * hit) / (SS * SS));
    }
  }
  return rgba;
}

// 大勾方块已退休:已收藏态改用 badge ✓(类 AdGuard),图标本体保持描边

// —— 输出 ——
const INDIGO = [79, 70, 229]; // #4f46e5
const WHITE = [255, 255, 255];
const GRAY = [95, 99, 104]; // #5f6368 工具栏中性灰(未收藏描边)
const GRAY_DISABLED = [179, 185, 194]; // #b3b9c2 浅灰(不可收藏,与未收藏拉开明度差)

mkdirSync(outDir, { recursive: true });
const outputs = [
  ...[16, 32, 48, 128].map((s) => [
    `icon-${s}.png`,
    encodePng(s, renderFilled(s, INDIGO, WHITE)),
  ]),
  ...[16, 32].map((s) => [
    `outline-${s}.png`,
    encodePng(s, renderOutline(s, GRAY)),
  ]),
  ...[16, 32].map((s) => [
    `disabled-${s}.png`,
    encodePng(s, renderOutline(s, GRAY_DISABLED)),
  ]),
];
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
console.log(
  `生成 ${outputs.length} 个图标 → icons/(工具栏状态图标另同步 public/icons/)`
);
