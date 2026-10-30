/**
 * 背景图压缩(GLOSSARY「背景」):上传即压缩,长边 ≤ 2560 重采样、
 * WebP(保 alpha)重编码后以 data URL 存 settings 键,不新增存储权限。
 *
 * 尺寸策略(resolveTargetSize)是可测纯逻辑;canvas 重编码管线
 * (compressBackgroundImage)依赖浏览器位图 API,按薄封装口径不单测。
 */

/** 目标尺寸(px):常见桌面背景图在屏上的清晰度上限,兼顾解码与配额。 */
export const BACKGROUND_MAX_EDGE = 2560;

/** WebP 有损质量:0.85 在照片底图上目测无损、体量可控。 */
const ENCODE_QUALITY = 0.85;

/**
 * 等比缩放的目标尺寸:长边钳到 maxEdge,绝不放大
 * (小图重采样只会模糊并膨胀字节,原样保留)。
 */
export function resolveTargetSize(
  naturalWidth: number,
  naturalHeight: number,
  maxEdge: number
): { width: number; height: number } {
  const longEdge = Math.max(naturalWidth, naturalHeight);
  const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
  return {
    width: Math.floor(naturalWidth * scale),
    height: Math.floor(naturalHeight * scale),
  };
}

/**
 * 压缩管线:图片文件 → data URL。
 * 非图片文件或解码失败抛错(UI 层就地转中文提示)。
 * 优先 WebP;环境不支持时回退 JPEG(Chrome 稳定支持 WebP,回退仅防御)。
 */
export async function compressBackgroundImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not-an-image");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = resolveTargetSize(
      bitmap.width,
      bitmap.height,
      BACKGROUND_MAX_EDGE
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no-2d-context");
    context.drawImage(bitmap, 0, 0, width, height);
    const webp = canvas.toDataURL("image/webp", ENCODE_QUALITY);
    if (webp.startsWith("data:image/webp")) return webp;
    return canvas.toDataURL("image/jpeg", ENCODE_QUALITY);
  } finally {
    bitmap.close();
  }
}
