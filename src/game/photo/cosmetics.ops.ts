export type AxisName = 'width' | 'height' | 'minSide' | 'maxSide' | 'diagonal';

export type Coord = number | {
  fraction?: number;
  pixels?: number;
  axis?: AxisName;
};

export interface GradientStop {
  position: number;
  color: string;
}

export type BlendMode =
  | 'source-over' | 'source-in' | 'source-out' | 'source-atop'
  | 'destination-over' | 'destination-in' | 'destination-out' | 'destination-atop'
  | 'lighter' | 'copy' | 'xor'
  | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

interface VisualEffectFields {
  opacity?: number;
  blendMode?: BlendMode;
}

export interface RectangleOp extends VisualEffectFields {
  type: 'rectangle';
  left: Coord; top: Coord; width: Coord; height: Coord;
  fill?: string; stroke?: string; lineWidth?: number;
}

export interface RoundedRectangleOp extends VisualEffectFields {
  type: 'roundedRectangle';
  left: Coord; top: Coord; width: Coord; height: Coord;
  cornerRadius: Coord;
  fill?: string; stroke?: string; lineWidth?: number;
}

export interface CircleOp extends VisualEffectFields {
  type: 'circle';
  centerX: Coord; centerY: Coord; radius: Coord;
  fill?: string; stroke?: string; lineWidth?: number;
}

export interface LineOp extends VisualEffectFields {
  type: 'line';
  startX: Coord; startY: Coord; endX: Coord; endY: Coord;
  stroke: string; lineWidth?: number;
}

export interface PathOp extends VisualEffectFields {
  type: 'path';
  pathData: string;
  scale?: Coord;
  offsetX?: Coord; offsetY?: Coord;
  rotation?: number;
  fill?: string; stroke?: string; lineWidth?: number;
}

export interface LinearGradientOp extends VisualEffectFields {
  type: 'linearGradient';
  startX: Coord; startY: Coord; endX: Coord; endY: Coord;
  stops: GradientStop[];
  fillRect?: { left: Coord; top: Coord; width: Coord; height: Coord };
}

export interface RadialGradientOp extends VisualEffectFields {
  type: 'radialGradient';
  centerX: Coord; centerY: Coord;
  innerRadius: Coord; outerRadius: Coord;
  stops: GradientStop[];
  fillRect?: { left: Coord; top: Coord; width: Coord; height: Coord };
}

export interface ImageOp extends VisualEffectFields {
  type: 'image';
  url: string;
  left: Coord; top: Coord; width: Coord; height: Coord;
}

export interface PatternOp extends VisualEffectFields {
  type: 'pattern';
  url: string;
  repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
  fillRect?: { left: Coord; top: Coord; width: Coord; height: Coord };
}

export interface TextOp extends VisualEffectFields {
  type: 'text';
  content: string;
  left: Coord; top: Coord;
  font: string;
  fill?: string; stroke?: string; lineWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

export interface GroupOp extends VisualEffectFields {
  type: 'group';
  layers: Op[];
  offsetX?: Coord; offsetY?: Coord;
  rotation?: number; // radians
  scaleX?: number; scaleY?: number;
}

export interface RepeatOp {
  type: 'repeat';
  direction: 'horizontal' | 'vertical';
  from: Coord; to: Coord; step: Coord;
  template: Op;
  positionField?: 'left' | 'top' | 'centerX' | 'centerY';
}

export type Op =
  | RectangleOp | RoundedRectangleOp | CircleOp | LineOp | PathOp
  | LinearGradientOp | RadialGradientOp
  | ImageOp | PatternOp | TextOp
  | GroupOp | RepeatOp;

export interface DrawCtx {
  width: number;
  height: number;
}

function pickAxis(c: DrawCtx, axis: AxisName | undefined, fallback: AxisName): number {
  const a = axis ?? fallback;

  switch (a) {
    case 'width': return c.width;
    case 'height': return c.height;
    case 'minSide': return Math.min(c.width, c.height);
    case 'maxSide': return Math.max(c.width, c.height);
    case 'diagonal': return Math.hypot(c.width, c.height);
  }
}

export function resolveCoord(c: DrawCtx, value: Coord, defaultAxis: AxisName): number {
  if (typeof value === 'number') return value;

  const fraction = value.fraction ?? 0;
  const pixels = value.pixels ?? 0;

  return fraction * pickAxis(c, value.axis, defaultAxis) + pixels;
}

const _imageCache = new Map<string, HTMLImageElement>();

function loadImage(url: string): HTMLImageElement {
  const cached = _imageCache.get(url);

  if (cached) return cached;

  const img = new Image();

  img.crossOrigin = 'anonymous';
  img.src = url;

  _imageCache.set(url, img);

  return img;
}

export function preloadOps(ops: Op[]): void {
  for (const op of ops) collectUrls(op, loadImage);
}

function collectUrls(op: Op, visit: (url: string) => void): void {
  switch (op.type) {
    case 'image':
    case 'pattern':
      visit(op.url);

      break;
    case 'group':
      for (const child of op.layers) collectUrls(child, visit);

      break;
    case 'repeat':
      collectUrls(op.template, visit);

      break;
  }
}

export function renderOps(ctx: CanvasRenderingContext2D, ops: Op[], bounds: { left: number; top: number; width: number; height: number },): void {
  ctx.save();
  ctx.translate(bounds.left, bounds.top);

  const local: DrawCtx = { width: bounds.width, height: bounds.height };

  for (const op of ops) renderOp(ctx, op, local);

  ctx.restore();
}

function renderOp(ctx: CanvasRenderingContext2D, op: Op, c: DrawCtx): void {
  ctx.save();

  applyEffectState(ctx, op);

  switch (op.type) {
    case 'rectangle': drawRectangle(ctx, op, c); break;
    case 'roundedRectangle': drawRoundedRectangle(ctx, op, c); break;
    case 'circle': drawCircle(ctx, op, c); break;
    case 'line': drawLine(ctx, op, c); break;
    case 'path': drawPath(ctx, op, c); break;
    case 'linearGradient': drawLinearGradient(ctx, op, c); break;
    case 'radialGradient': drawRadialGradient(ctx, op, c); break;
    case 'image': drawImage(ctx, op, c); break;
    case 'pattern': drawPattern(ctx, op, c); break;
    case 'text': drawText(ctx, op, c); break;
    case 'group': drawGroup(ctx, op, c); break;
    case 'repeat': drawRepeat(ctx, op, c); break;
  }

  ctx.restore();
}

function applyEffectState(ctx: CanvasRenderingContext2D, op: Op): void {
  if (op.type === 'repeat') return;
  if (op.opacity !== undefined) ctx.globalAlpha *= op.opacity;
  if (op.blendMode) ctx.globalCompositeOperation = op.blendMode;
}

function drawRectangle(ctx: CanvasRenderingContext2D, op: RectangleOp, c: DrawCtx): void {
  const left = resolveCoord(c, op.left, 'width');
  const top = resolveCoord(c, op.top, 'height');
  const width = resolveCoord(c, op.width, 'width');
  const height = resolveCoord(c, op.height, 'height');

  if (op.fill) {
    ctx.fillStyle = op.fill;
    ctx.fillRect(left, top, width, height);
  }

  if (op.stroke) {
    ctx.strokeStyle = op.stroke;

    if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;

    ctx.strokeRect(left, top, width, height);
  }
}

function pathRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0 || h <= 0) return;

  r = Math.max(0, Math.min(r, w / 2, h / 2));

  ctx.beginPath();

  if (r <= 0) {
    ctx.rect(x, y, w, h);

    return;
  }

  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRoundedRectangle(ctx: CanvasRenderingContext2D, op: RoundedRectangleOp, c: DrawCtx): void {
  const left = resolveCoord(c, op.left, 'width');
  const top = resolveCoord(c, op.top, 'height');
  const width = resolveCoord(c, op.width, 'width');
  const height = resolveCoord(c, op.height, 'height');
  const radius = resolveCoord(c, op.cornerRadius, 'minSide');

  pathRoundedRect(ctx, left, top, width, height, radius);

  if (op.fill) {
    ctx.fillStyle = op.fill;
    ctx.fill();
  }

  if (op.stroke) {
    ctx.strokeStyle = op.stroke;

    if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;

    ctx.stroke();
  }
}

function drawCircle(ctx: CanvasRenderingContext2D, op: CircleOp, c: DrawCtx): void {
  const cx = resolveCoord(c, op.centerX, 'width');
  const cy = resolveCoord(c, op.centerY, 'height');
  const r = resolveCoord(c, op.radius, 'minSide');

  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, r), 0, Math.PI * 2);

  if (op.fill) {
    ctx.fillStyle = op.fill;
    ctx.fill();
  }

  if (op.stroke) {
    ctx.strokeStyle = op.stroke;

    if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;

    ctx.stroke();
  }
}

function drawLine(ctx: CanvasRenderingContext2D, op: LineOp, c: DrawCtx): void {
  const x1 = resolveCoord(c, op.startX, 'width');
  const y1 = resolveCoord(c, op.startY, 'height');
  const x2 = resolveCoord(c, op.endX, 'width');
  const y2 = resolveCoord(c, op.endY, 'height');

  ctx.strokeStyle = op.stroke;

  if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawPath(ctx: CanvasRenderingContext2D, op: PathOp, c: DrawCtx): void {
  const tx = op.offsetX !== undefined ? resolveCoord(c, op.offsetX, 'width') : 0;
  const ty = op.offsetY !== undefined ? resolveCoord(c, op.offsetY, 'height') : 0;
  const sc = op.scale !== undefined ? resolveCoord(c, op.scale, 'minSide') : 1;

  ctx.translate(tx, ty);

  if (op.rotation) ctx.rotate(op.rotation);
  if (sc !== 1) ctx.scale(sc, sc);

  const path = new Path2D(op.pathData);

  if (op.fill) {
    ctx.fillStyle = op.fill;
    ctx.fill(path);
  }

  if (op.stroke) {
    ctx.strokeStyle = op.stroke;

    if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;

    ctx.stroke(path);
  }
}

function resolveFillRect(rect: { left: Coord; top: Coord; width: Coord; height: Coord } | undefined, c: DrawCtx): { left: number; top: number; width: number; height: number } {
  if (!rect) return { left: 0, top: 0, width: c.width, height: c.height };

  return {
    left: resolveCoord(c, rect.left, 'width'),
    top: resolveCoord(c, rect.top, 'height'),
    width: resolveCoord(c, rect.width, 'width'),
    height: resolveCoord(c, rect.height, 'height'),
  };
}

function drawLinearGradient(ctx: CanvasRenderingContext2D, op: LinearGradientOp, c: DrawCtx): void {
  const x1 = resolveCoord(c, op.startX, 'width');
  const y1 = resolveCoord(c, op.startY, 'height');
  const x2 = resolveCoord(c, op.endX, 'width');
  const y2 = resolveCoord(c, op.endY, 'height');
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);

  for (const s of op.stops) grad.addColorStop(s.position, s.color);

  const r = resolveFillRect(op.fillRect, c);

  ctx.fillStyle = grad;
  ctx.fillRect(r.left, r.top, r.width, r.height);
}

function drawRadialGradient(ctx: CanvasRenderingContext2D, op: RadialGradientOp, c: DrawCtx): void {
  const cx = resolveCoord(c, op.centerX, 'width');
  const cy = resolveCoord(c, op.centerY, 'height');
  const r0 = Math.max(0, resolveCoord(c, op.innerRadius, 'minSide'));
  const r1 = Math.max(r0 + 0.01, resolveCoord(c, op.outerRadius, 'minSide'));
  const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
  for (const s of op.stops) grad.addColorStop(s.position, s.color);
  const r = resolveFillRect(op.fillRect, c);
  ctx.fillStyle = grad;
  ctx.fillRect(r.left, r.top, r.width, r.height);
}

function drawImage(ctx: CanvasRenderingContext2D, op: ImageOp, c: DrawCtx): void {
  const img = loadImage(op.url);
  if (!img.complete || img.naturalWidth === 0) return;
  const left = resolveCoord(c, op.left, 'width');
  const top = resolveCoord(c, op.top, 'height');
  const width = resolveCoord(c, op.width, 'width');
  const height = resolveCoord(c, op.height, 'height');
  ctx.drawImage(img, left, top, width, height);
}

function drawPattern(ctx: CanvasRenderingContext2D, op: PatternOp, c: DrawCtx): void {
  const img = loadImage(op.url);
  if (!img.complete || img.naturalWidth === 0) return;
  const repeat = op.repeat ?? 'repeat';
  const pat = ctx.createPattern(img, repeat);
  if (!pat) return;
  const r = resolveFillRect(op.fillRect, c);
  ctx.fillStyle = pat;
  ctx.fillRect(r.left, r.top, r.width, r.height);
}

function drawText(ctx: CanvasRenderingContext2D, op: TextOp, c: DrawCtx): void {
  const left = resolveCoord(c, op.left, 'width');
  const top = resolveCoord(c, op.top, 'height');
  ctx.font = op.font;
  if (op.align) ctx.textAlign = op.align;
  if (op.baseline) ctx.textBaseline = op.baseline;
  if (op.fill) { ctx.fillStyle = op.fill; ctx.fillText(op.content, left, top); }
  if (op.stroke) {
    ctx.strokeStyle = op.stroke;
    if (op.lineWidth !== undefined) ctx.lineWidth = op.lineWidth;
    ctx.strokeText(op.content, left, top);
  }
}

function drawGroup(ctx: CanvasRenderingContext2D, op: GroupOp, c: DrawCtx): void {
  const tx = op.offsetX !== undefined ? resolveCoord(c, op.offsetX, 'width') : 0;
  const ty = op.offsetY !== undefined ? resolveCoord(c, op.offsetY, 'height') : 0;
  ctx.translate(tx, ty);
  if (op.rotation) ctx.rotate(op.rotation);
  if (op.scaleX !== undefined || op.scaleY !== undefined) {
    ctx.scale(op.scaleX ?? 1, op.scaleY ?? 1);
  }
  for (const child of op.layers) renderOp(ctx, child, c);
}

function drawRepeat(ctx: CanvasRenderingContext2D, op: RepeatOp, c: DrawCtx): void {
  const horizontal = op.direction === 'horizontal';
  const fallbackAxis: AxisName = horizontal ? 'width' : 'height';
  const from = resolveCoord(c, op.from, fallbackAxis);
  const to = resolveCoord(c, op.to, fallbackAxis);
  const step = resolveCoord(c, op.step, fallbackAxis);
  if (step <= 0) return;
  const fieldName = op.positionField ?? (horizontal ? 'centerX' : 'centerY');
  for (let pos = from; pos <= to; pos += step) {
    const child = { ...op.template } as unknown as Record<string, unknown>;
    child[fieldName] = pos;
    renderOp(ctx, child as unknown as Op, c);
  }
}
