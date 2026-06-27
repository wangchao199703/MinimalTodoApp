//! 截图标注的形状模型与几何/绘制工具(实时 SVG 预览与导出 canvas 共用,DRY)。

export type Tool = "select" | "pen" | "arrow" | "rect";

/** 选区矩形,overlay 视口 CSS 像素 */
export interface Rect {
  l: number;
  t: number;
  w: number;
  h: number;
}

export interface PenShape {
  kind: "pen";
  color: string;
  /** 线宽(CSS px) */
  w: number;
  points: { x: number; y: number }[];
}
export interface SegShape {
  kind: "arrow" | "rect";
  color: string;
  w: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export type Shape = PenShape | SegShape;

/** 标注默认线宽(CSS px) */
export const STROKE = 3;
/** 箭头头部长度(CSS px) */
export const ARROW_HEAD = 14;

/** 箭头头部三角形的三个顶点(给定起点→终点) */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): { x: number; y: number }[] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    { x: x2, y: y2 },
    { x: x2 - size * Math.cos(angle - spread), y: y2 - size * Math.sin(angle - spread) },
    { x: x2 - size * Math.cos(angle + spread), y: y2 - size * Math.sin(angle + spread) },
  ];
}

/** 把一个标注画到导出 canvas:坐标减选区原点后乘缩放因子(CSS → 物理像素)。 */
export function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  sel: Rect,
  sf: number,
): void {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.w * sf;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const tx = (x: number) => (x - sel.l) * sf;
  const ty = (y: number) => (y - sel.t) * sf;

  if (s.kind === "pen") {
    if (s.points.length === 0) return;
    ctx.beginPath();
    s.points.forEach((p, i) =>
      i ? ctx.lineTo(tx(p.x), ty(p.y)) : ctx.moveTo(tx(p.x), ty(p.y)),
    );
    ctx.stroke();
    return;
  }
  if (s.kind === "rect") {
    ctx.strokeRect(tx(s.x1), ty(s.y1), (s.x2 - s.x1) * sf, (s.y2 - s.y1) * sf);
    return;
  }
  // arrow
  ctx.beginPath();
  ctx.moveTo(tx(s.x1), ty(s.y1));
  ctx.lineTo(tx(s.x2), ty(s.y2));
  ctx.stroke();
  const head = arrowHead(tx(s.x1), ty(s.y1), tx(s.x2), ty(s.y2), ARROW_HEAD * sf);
  ctx.beginPath();
  head.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
}
