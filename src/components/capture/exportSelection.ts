//! 把截图选区 + 标注 bake 成 PNG Blob:底图从冻结帧物理像素裁出,标注叠加其上。

import type { Rect, Shape } from "./shapes";
import { drawShapeOnCanvas } from "./shapes";

/**
 * @param img  已解码的冻结帧 <img>(naturalWidth/Height = 虚拟桌面物理像素)
 * @param sel  选区(overlay 视口 CSS 像素)
 * @param sf   scaleFactor:CSS → 物理像素
 */
export async function exportSelection(
  img: HTMLImageElement,
  sel: Rect,
  shapes: Shape[],
  sf: number,
): Promise<Blob> {
  const pw = Math.max(1, Math.round(sel.w * sf));
  const ph = Math.max(1, Math.round(sel.h * sf));
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 canvas 2D 上下文");

  ctx.drawImage(img, sel.l * sf, sel.t * sf, sel.w * sf, sel.h * sf, 0, 0, pw, ph);
  for (const s of shapes) drawShapeOnCanvas(ctx, s, sel, sf);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("导出 PNG 失败"))),
      "image/png",
    ),
  );
}
