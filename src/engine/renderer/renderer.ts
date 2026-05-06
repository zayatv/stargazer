import type {
  RendererState, EntityRenderFn, EntityBoundsFn, DrawFn,
  TextStyle, ShapeStyle, LineStyle, ImageOptions,
  QueueEntry, Rect,
} from './renderer.types.ts';
import type { LayoutNode } from '../layout/layout.types.ts';
import type { GameWorld } from '../types.ts';
import { computeAbsolutePositions } from '../layout/layout.render.ts';
import { applyCameraTransform } from '../camera/camera.ts';
import type { CameraState } from '../camera/camera.types.ts';

function applyParallaxTransform(ctx: CanvasRenderingContext2D, camera: CameraState, screenW: number, screenH: number, depth: number): void {
  const px = camera.x * depth;
  const py = camera.y * depth;

  ctx.translate(screenW * 0.5, screenH * 0.5);
  ctx.scale(camera.zoom, camera.zoom);

  if (camera.rotation !== 0) {
    ctx.rotate(-camera.rotation);
  }

  ctx.translate(-px, -py);
}

export function createRenderer(): RendererState {
  return {
    entityRenderers: new Map(),
    _queue: [],
  };
}

export function registerEntityRenderer(world: GameWorld, eid: number, layer: number, render: EntityRenderFn, order = 0, worldSpace = false, depth = 1, bounds: EntityBoundsFn | null = null): void {
  world.renderer.entityRenderers.set(eid, { layer, order, worldSpace, depth, render, bounds });
}

export function unregisterEntityRenderer(world: GameWorld, eid: number): void {
  world.renderer.entityRenderers.delete(eid);
}

export function setEntityLayer(world: GameWorld, eid: number, layer: number, order?: number): void {
  const entry = world.renderer.entityRenderers.get(eid);

  if (entry) {
    entry.layer = layer;

    if (order !== undefined) entry.order = order;
  }
}

export function submit(world: GameWorld, layer: number, order: number, draw: DrawFn, worldSpace = false, depth = 1, bounds: Rect | null = null): void {
  world.renderer._queue.push({ kind: 0, layer, order, worldSpace, depth, bounds, draw });
}

export function submitText(
  world: GameWorld,
  layer: number,
  order: number,
  text: string,
  x: number,
  y: number,
  style?: TextStyle,
  worldSpace = false,
  depth = 1,
): void {
  const font = style?.font ?? '16px sans-serif';
  const fill = style?.fill;
  const stroke = style?.stroke;
  const strokeWidth = style?.strokeWidth ?? 1;
  const align = style?.align ?? 'start';
  const baseline = style?.baseline ?? 'alphabetic';
  const maxWidth = style?.maxWidth;

  const measureCtx = world.ctx;
  const prevFont = measureCtx.font;
  const prevAlign = measureCtx.textAlign;
  const prevBaseline = measureCtx.textBaseline;

  measureCtx.font = font;
  measureCtx.textAlign = align;
  measureCtx.textBaseline = baseline;

  const m = measureCtx.measureText(text);

  measureCtx.font = prevFont;
  measureCtx.textAlign = prevAlign;
  measureCtx.textBaseline = prevBaseline;

  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? m.width;
  const ascent = m.actualBoundingBoxAscent ?? 0;
  const descent = m.actualBoundingBoxDescent ?? 0;
  const bounds: Rect = {
    x: x - left,
    y: y - ascent,
    w: left + right,
    h: ascent + descent,
  };

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth, bounds,
    draw: (ctx) => {
      ctx.font = font;
      ctx.textAlign = align;
      ctx.textBaseline = baseline;

      if (fill) {
        ctx.fillStyle = fill;

        if (maxWidth !== undefined) ctx.fillText(text, x, y, maxWidth);
        else ctx.fillText(text, x, y);
      }

      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;

        if (maxWidth !== undefined) ctx.strokeText(text, x, y, maxWidth);
        else ctx.strokeText(text, x, y);
      }

      if (!fill && !stroke) {
        ctx.fillStyle = '#fff';

        if (maxWidth !== undefined) ctx.fillText(text, x, y, maxWidth);
        else ctx.fillText(text, x, y);
      }
    },
  });
}

export function submitRect(
  world: GameWorld,
  layer: number,
  order: number,
  x: number,
  y: number,
  w: number,
  h: number,
  style?: ShapeStyle,
  worldSpace = false,
  depth = 1,
): void {
  const fill = style?.fill;
  const stroke = style?.stroke;
  const strokeWidth = style?.strokeWidth ?? 1;

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth,
    bounds: { x, y, w, h },
    draw: (ctx) => {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
      }

      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(x, y, w, h);
      }
    },
  });
}

export function submitCircle(
  world: GameWorld,
  layer: number,
  order: number,
  cx: number,
  cy: number,
  r: number,
  style?: ShapeStyle,
  worldSpace = false,
  depth = 1,
): void {
  const fill = style?.fill;
  const stroke = style?.stroke;
  const strokeWidth = style?.strokeWidth ?? 1;

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth,
    bounds: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);

      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }

      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }
    },
  });
}

export function submitLine(
  world: GameWorld,
  layer: number,
  order: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style?: LineStyle,
  worldSpace = false,
  depth = 1,
): void {
  const stroke = style?.stroke ?? '#fff';
  const width = style?.width ?? 1;
  const cap = style?.cap ?? 'butt';
  const join = style?.join ?? 'miter';
  const dash = style?.dash;
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const halfW = width * 0.5;

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth,
    bounds: {
      x: minX - halfW,
      y: minY - halfW,
      w: Math.abs(x2 - x1) + width,
      h: Math.abs(y2 - y1) + width,
    },
    draw: (ctx) => {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineCap = cap;
      ctx.lineJoin = join;

      if (dash) ctx.setLineDash(dash);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (dash) ctx.setLineDash([]);
    },
  });
}

export function submitImage(
  world: GameWorld,
  layer: number,
  order: number,
  image: CanvasImageSource,
  dx: number,
  dy: number,
  opts?: ImageOptions,
  worldSpace = false,
  depth = 1,
): void {
  const sx = opts?.sx;
  const sy = opts?.sy;
  const sw = opts?.sw;
  const sh = opts?.sh;
  const dw = opts?.width;
  const dh = opts?.height;
  const rotation = opts?.rotation ?? 0;
  const anchorX = opts?.anchorX ?? 0;
  const anchorY = opts?.anchorY ?? 0;
  const alpha = opts?.alpha ?? 1;

  const boundsW = dw ?? sw ?? (image as HTMLImageElement).width ?? 0;
  const boundsH = dh ?? sh ?? (image as HTMLImageElement).height ?? 0;
  let bounds: Rect;

  if (rotation === 0) {
    bounds = { x: dx, y: dy, w: boundsW, h: boundsH };
  } else {
    const px = dx + boundsW * anchorX;
    const py = dy + boundsH * anchorY;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners: [number, number][] = [
      [dx, dy], [dx + boundsW, dy], [dx + boundsW, dy + boundsH], [dx, dy + boundsH],
    ];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < 4; i++) {
      const [cx, cy] = corners[i];
      const rx = px + (cx - px) * cos - (cy - py) * sin;
      const ry = py + (cx - px) * sin + (cy - py) * cos;

      if (rx < minX) minX = rx;
      if (ry < minY) minY = ry;
      if (rx > maxX) maxX = rx;
      if (ry > maxY) maxY = ry;
    }

    bounds = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  world.renderer._queue.push({
    kind: 0, layer, order, worldSpace, depth, bounds,
    draw: (ctx) => {
      const w = dw ?? (sw ?? (image as HTMLImageElement).width ?? 0);
      const h = dh ?? (sh ?? (image as HTMLImageElement).height ?? 0);

      if (alpha < 1) ctx.globalAlpha = alpha;

      if (rotation !== 0) {
        const px = dx + w * anchorX;
        const py = dy + h * anchorY;

        ctx.translate(px, py);
        ctx.rotate(rotation);
        ctx.translate(-px, -py);
      }

      if (sx !== undefined && sy !== undefined && sw !== undefined && sh !== undefined) {
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, w, h);
      } else if (dw !== undefined && dh !== undefined) {
        ctx.drawImage(image, dx, dy, dw, dh);
      } else {
        ctx.drawImage(image, dx, dy);
      }
    },
  });
}

function compareEntries(a: QueueEntry, b: QueueEntry): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  if (a.order !== b.order) return a.order - b.order;

  return a.kind - b.kind;
}

function collectLayoutNodes(node: LayoutNode, queue: QueueEntry[], parentLayer: number, parentOrder: number): void {
  if (!node.visible) return;

  const effectiveLayer = node.layer ?? parentLayer;
  const effectiveOrder = node.order ?? parentOrder;

  if (node.onRender !== null) {
    const c = node.computed;
    const bounds: Rect = { x: c.absX, y: c.absY, w: c.width, h: c.height };

    queue.push({ kind: 1, layer: effectiveLayer, order: effectiveOrder, worldSpace: false, depth: 1, bounds, node });
  }

  for (let i = 0; i < node.children.length; i++) {
    collectLayoutNodes(node.children[i], queue, effectiveLayer, effectiveOrder);
  }
}

export function flush(world: GameWorld): void {
  const r = world.renderer;
  const ctx = world.ctx;

  computeAbsolutePositions(world.layout);

  const rootNode = world.layout.root;

  collectLayoutNodes(rootNode, r._queue, rootNode.layer ?? 0, rootNode.order ?? 0);

  r.entityRenderers.forEach((entry, eid) => {
    r._queue.push({
      kind: 2, layer: entry.layer, order: entry.order,
      worldSpace: entry.worldSpace, depth: entry.depth,
      bounds: entry.bounds ? entry.bounds(world, eid) : null,
      eid, render: entry.render,
    });
  });

  r._queue.sort(compareEntries);

  const camera = world.camera;
  const screenW = world.canvas.clientWidth;
  const screenH = world.canvas.clientHeight;

  const screenRect: Rect = { x: 0, y: 0, w: screenW, h: screenH };
  const worldRect: Rect = computeWorldViewRect(camera, screenW, screenH, 1);
  const parallaxRectCache = new Map<number, Rect>();

  const minVisiblePixelArea = computeMinVisiblePixelArea(MIN_VISIBLE_FEATURE_AREA, camera.maxZoom);

  for (let i = 0; i < r._queue.length; i++) {
    const e = r._queue[i];

    if (e.bounds !== null) {
      let vp: Rect;

      if (!e.worldSpace) {
        vp = screenRect;
      } else if (e.depth === 1) {
        vp = worldRect;
      } else {
        const cached = parallaxRectCache.get(e.depth);

        if (cached !== undefined) {
          vp = cached;
        } else {
          vp = computeWorldViewRect(camera, screenW, screenH, e.depth);

          parallaxRectCache.set(e.depth, vp);
        }
      }

      if (!rectsOverlap(e.bounds, vp)) continue;

      if (e.worldSpace) {
        const screenArea = e.bounds.w * e.bounds.h * camera.zoom * camera.zoom;

        if (screenArea < minVisiblePixelArea) continue;
      }
    }

    ctx.save();

    if (e.worldSpace) {
      if (e.depth === 1) {
        applyCameraTransform(ctx, camera, screenW, screenH);
      } else {
        applyParallaxTransform(ctx, camera, screenW, screenH, e.depth);
      }
    }

    switch (e.kind) {
      case 0: e.draw(ctx); break;
      case 1: e.node.onRender!(ctx, e.node); break;
      case 2: e.render(ctx, world, e.eid); break;
    }

    ctx.restore();
  }

  r._queue.length = 0;
}

function computeWorldViewRect(camera: CameraState, screenW: number, screenH: number, depth: number): Rect {
  const halfW = screenW * 0.5;
  const halfH = screenH * 0.5;
  const invZoom = 1 / camera.zoom;

  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const camPx = camera.x * depth;
  const camPy = camera.y * depth;

  const cxs = [-halfW, halfW, halfW, -halfW];
  const cys = [-halfH, -halfH, halfH, halfH];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (let i = 0; i < 4; i++) {
    const sx = cxs[i] * invZoom;
    const sy = cys[i] * invZoom;
    const wx = (cos * sx - sin * sy) + camPx;
    const wy = (sin * sx + cos * sy) + camPy;

    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x + a.w >= b.x &&
    a.x <= b.x + b.w &&
    a.y + a.h >= b.y &&
    a.y <= b.y + b.h
  );
}

const MIN_VISIBLE_FEATURE_AREA = 0.1;

function computeMinVisiblePixelArea(minFeatureArea: number, maxZoom: number): number {
  return minFeatureArea * maxZoom * maxZoom;
}
