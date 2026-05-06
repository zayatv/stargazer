import type {
  TrailConfig, TrailState, TrailPoint,
  PathPoint, PathConfig,
} from './trail.types.ts';
import type { GameWorld } from '../types.ts';

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbaString(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

const defaultConfig: TrailConfig = {
  maxPoints: 128,
  lifetime: 1,
  widthStart: 4,
  widthEnd: 0,
  color: '#ffffff',
  alphaStart: 1,
  alphaEnd: 0,
  minDistance: 2,
  smooth: false,
  smoothSegments: 4,
  roundCap: true,
  blendMode: 'source-over',
};

export function createTrail(overrides?: Partial<TrailConfig>): TrailState {
  const config = { ...defaultConfig, ...overrides };
  return {
    points: [],
    config,
    _colorRGB: parseHex(config.color),
  };
}

export function addTrailPoint(trail: TrailState, x: number, y: number): void {
  const pts = trail.points;
  const minDist = trail.config.minDistance;

  if (pts.length > 0) {
    const last = pts[pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    if (dx * dx + dy * dy < minDist * minDist) return;
  }

  pts.push({ x, y, age: 0 });

  if (pts.length > trail.config.maxPoints) {
    pts.shift();
  }
}

export function updateTrail(trail: TrailState, dt: number): void {
  const pts = trail.points;
  const lifetime = trail.config.lifetime;

  for (let i = pts.length - 1; i >= 0; i--) {
    pts[i].age += dt;
    if (pts[i].age >= lifetime) {

      pts.splice(0, i + 1);
      break;
    }
  }
}

export function clearTrail(trail: TrailState): void {
  trail.points.length = 0;
}

function catmullRom(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number,
): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1x) + (-p0x + p2x) * t + (2 * p0x - 5 * p1x + 4 * p2x - p3x) * t2 + (-p0x + 3 * p1x - 3 * p2x + p3x) * t3),
    y: 0.5 * ((2 * p1y) + (-p0y + p2y) * t + (2 * p0y - 5 * p1y + 4 * p2y - p3y) * t2 + (-p0y + 3 * p1y - 3 * p2y + p3y) * t3),
  };
}

interface RenderPoint {
  x: number;
  y: number;

  t: number;
}

function subdividePoints(points: TrailPoint[], lifetime: number, segments: number): RenderPoint[] {
  const n = points.length;
  if (n < 2) return points.map(p => ({ x: p.x, y: p.y, t: 1 - p.age / lifetime }));

  const result: RenderPoint[] = [];

  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = i;
    const i2 = i + 1;
    const i3 = Math.min(n - 1, i + 2);

    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];
    const p3 = points[i3];

    for (let s = 0; s < segments; s++) {
      const frac = s / segments;
      const pt = catmullRom(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, frac);
      const age = p1.age + (p2.age - p1.age) * frac;
      result.push({ x: pt.x, y: pt.y, t: Math.max(0, 1 - age / lifetime) });
    }
  }

  const last = points[n - 1];
  result.push({ x: last.x, y: last.y, t: Math.max(0, 1 - last.age / lifetime) });

  return result;
}

interface RibbonVertex {
  lx: number; ly: number;
  rx: number; ry: number;
  alpha: number;
}

function buildRibbon(
  renderPoints: RenderPoint[],
  widthStart: number, widthEnd: number,
  alphaStart: number, alphaEnd: number,
): RibbonVertex[] {
  const n = renderPoints.length;
  if (n < 2) return [];

  const verts: RibbonVertex[] = [];

  for (let i = 0; i < n; i++) {
    const p = renderPoints[i];
    const t = p.t;

    const w = widthEnd + (widthStart - widthEnd) * t;
    const a = alphaEnd + (alphaStart - alphaEnd) * t;
    const halfW = w * 0.5;

    let nx: number, ny: number;
    if (i === 0) {
      const next = renderPoints[1];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else if (i === n - 1) {
      const prev = renderPoints[n - 2];
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else {

      const prev = renderPoints[i - 1];
      const next = renderPoints[i + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    }

    verts.push({
      lx: p.x + nx * halfW,
      ly: p.y + ny * halfW,
      rx: p.x - nx * halfW,
      ry: p.y - ny * halfW,
      alpha: a,
    });
  }

  return verts;
}

function drawRibbon(
  ctx: CanvasRenderingContext2D,
  verts: RibbonVertex[],
  r: number, g: number, b: number,
  blendMode: GlobalCompositeOperation,
  roundCap: boolean,
  renderPoints: RenderPoint[],
  widthStart: number, widthEnd: number,
): void {
  if (verts.length < 2) return;

  const prevComposite = ctx.globalCompositeOperation;
  if (blendMode !== 'source-over') {
    ctx.globalCompositeOperation = blendMode;
  }

  for (let i = 0; i < verts.length - 1; i++) {
    const v0 = verts[i];
    const v1 = verts[i + 1];
    const alpha = (v0.alpha + v1.alpha) * 0.5;
    if (alpha <= 0.001) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgbaString(r, g, b, 1);
    ctx.beginPath();
    ctx.moveTo(v0.lx, v0.ly);
    ctx.lineTo(v1.lx, v1.ly);
    ctx.lineTo(v1.rx, v1.ry);
    ctx.lineTo(v0.rx, v0.ry);
    ctx.closePath();
    ctx.fill();
  }

  if (roundCap && renderPoints.length >= 2) {

    const head = renderPoints[renderPoints.length - 1];
    const headW = widthEnd + (widthStart - widthEnd) * head.t;
    const headA = verts[verts.length - 1].alpha;
    if (headA > 0.001 && headW > 0) {
      ctx.globalAlpha = headA;
      ctx.fillStyle = rgbaString(r, g, b, 1);
      ctx.beginPath();
      ctx.arc(head.x, head.y, headW * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    const tail = renderPoints[0];
    const tailW = widthEnd + (widthStart - widthEnd) * tail.t;
    const tailA = verts[0].alpha;
    if (tailA > 0.001 && tailW > 0) {
      ctx.globalAlpha = tailA;
      ctx.fillStyle = rgbaString(r, g, b, 1);
      ctx.beginPath();
      ctx.arc(tail.x, tail.y, tailW * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  if (blendMode !== 'source-over') {
    ctx.globalCompositeOperation = prevComposite;
  }
}

export function submitTrail(
  world: GameWorld,
  trail: TrailState,
  layer: number,
  order: number,
  worldSpace = false,
  depth = 1,
): void {
  const pts = trail.points;
  if (pts.length < 2) return;

  const cfg = trail.config;
  const [cr, cg, cb] = trail._colorRGB;

  let renderPoints: RenderPoint[];
  if (cfg.smooth && pts.length >= 3) {
    renderPoints = subdividePoints(pts, cfg.lifetime, cfg.smoothSegments);
  } else {
    renderPoints = pts.map(p => ({
      x: p.x, y: p.y,
      t: Math.max(0, 1 - p.age / cfg.lifetime),
    }));
  }

  const ribbon = buildRibbon(renderPoints, cfg.widthStart, cfg.widthEnd, cfg.alphaStart, cfg.alphaEnd);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < renderPoints.length; i++) {
    const p = renderPoints[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = Math.max(cfg.widthStart, cfg.widthEnd) * 0.5;

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth,
    bounds: { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 },
    draw: (ctx) => {
      drawRibbon(ctx, ribbon, cr, cg, cb, cfg.blendMode, cfg.roundCap, renderPoints, cfg.widthStart, cfg.widthEnd);
    },
  });
}

export function submitPath(
  world: GameWorld,
  layer: number,
  order: number,
  points: PathPoint[],
  config?: PathConfig,
  worldSpace = false,
  depth = 1,
): void {
  if (points.length < 2) return;

  const defaultWidth = config?.width ?? 2;
  const colorHex = config?.color ?? '#ffffff';
  const defaultAlpha = config?.alpha ?? 1;
  const roundCap = config?.roundCap ?? true;
  const blendMode = config?.blendMode ?? 'source-over';
  const smooth = config?.smooth ?? false;
  const smoothSegs = config?.smoothSegments ?? 4;
  const [cr, cg, cb] = parseHex(colorHex);

  let renderPoints: RenderPoint[];

  if (smooth && points.length >= 3) {

    const n = points.length;
    renderPoints = [];

    for (let i = 0; i < n - 1; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = i;
      const i2 = i + 1;
      const i3 = Math.min(n - 1, i + 2);

      for (let s = 0; s < smoothSegs; s++) {
        const frac = s / smoothSegs;
        const pt = catmullRom(
          points[i0].x, points[i0].y,
          points[i1].x, points[i1].y,
          points[i2].x, points[i2].y,
          points[i3].x, points[i3].y,
          frac,
        );

        const globalT = (i + frac) / (n - 1);
        renderPoints.push({ x: pt.x, y: pt.y, t: globalT });
      }
    }

    renderPoints.push({ x: points[n - 1].x, y: points[n - 1].y, t: 1 });
  } else {
    renderPoints = points.map((p, i) => ({
      x: p.x, y: p.y,
      t: points.length > 1 ? i / (points.length - 1) : 0,
    }));
  }

  const n = renderPoints.length;
  const srcN = points.length;
  const widths: number[] = new Array(n);
  const alphas: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const t = renderPoints[i].t;

    const srcIdx = t * (srcN - 1);
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, srcN - 1);
    const frac = srcIdx - lo;

    const w0 = points[lo].width ?? defaultWidth;
    const w1 = points[hi].width ?? defaultWidth;
    widths[i] = w0 + (w1 - w0) * frac;

    const a0 = points[lo].alpha ?? defaultAlpha;
    const a1 = points[hi].alpha ?? defaultAlpha;
    alphas[i] = a0 + (a1 - a0) * frac;
  }

  const verts: RibbonVertex[] = [];
  for (let i = 0; i < n; i++) {
    const p = renderPoints[i];
    const halfW = widths[i] * 0.5;
    const a = alphas[i];

    let nx: number, ny: number;
    if (i === 0) {
      const next = renderPoints[1];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else if (i === n - 1) {
      const prev = renderPoints[n - 2];
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    } else {
      const prev = renderPoints[i - 1];
      const next = renderPoints[i + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      nx = -dy / len;
      ny = dx / len;
    }

    verts.push({
      lx: p.x + nx * halfW,
      ly: p.y + ny * halfW,
      rx: p.x - nx * halfW,
      ry: p.y - ny * halfW,
      alpha: a,
    });
  }

  let pathMinX = Infinity, pathMinY = Infinity, pathMaxX = -Infinity, pathMaxY = -Infinity, pathMaxW = 0;
  for (let i = 0; i < n; i++) {
    const p = renderPoints[i];
    if (p.x < pathMinX) pathMinX = p.x;
    if (p.y < pathMinY) pathMinY = p.y;
    if (p.x > pathMaxX) pathMaxX = p.x;
    if (p.y > pathMaxY) pathMaxY = p.y;
    if (widths[i] > pathMaxW) pathMaxW = widths[i];
  }
  const pathPad = pathMaxW * 0.5;

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth,
    bounds: {
      x: pathMinX - pathPad,
      y: pathMinY - pathPad,
      w: (pathMaxX - pathMinX) + pathPad * 2,
      h: (pathMaxY - pathMinY) + pathPad * 2,
    },
    draw: (ctx) => {
      const prevComposite = ctx.globalCompositeOperation;
      if (blendMode !== 'source-over') {
        ctx.globalCompositeOperation = blendMode;
      }

      for (let i = 0; i < verts.length - 1; i++) {
        const v0 = verts[i];
        const v1 = verts[i + 1];
        const alpha = (v0.alpha + v1.alpha) * 0.5;
        if (alpha <= 0.001) continue;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = rgbaString(cr, cg, cb, 1);
        ctx.beginPath();
        ctx.moveTo(v0.lx, v0.ly);
        ctx.lineTo(v1.lx, v1.ly);
        ctx.lineTo(v1.rx, v1.ry);
        ctx.lineTo(v0.rx, v0.ry);
        ctx.closePath();
        ctx.fill();
      }

      if (roundCap && n >= 2) {

        if (alphas[0] > 0.001 && widths[0] > 0) {
          ctx.globalAlpha = alphas[0];
          ctx.fillStyle = rgbaString(cr, cg, cb, 1);
          ctx.beginPath();
          ctx.arc(renderPoints[0].x, renderPoints[0].y, widths[0] * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }

        if (alphas[n - 1] > 0.001 && widths[n - 1] > 0) {
          ctx.globalAlpha = alphas[n - 1];
          ctx.fillStyle = rgbaString(cr, cg, cb, 1);
          ctx.beginPath();
          ctx.arc(renderPoints[n - 1].x, renderPoints[n - 1].y, widths[n - 1] * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;
      if (blendMode !== 'source-over') {
        ctx.globalCompositeOperation = prevComposite;
      }
    },
  });
}

export function setTrailColor(trail: TrailState, color: string): void {
  trail.config.color = color;
  trail._colorRGB = parseHex(color);
}
