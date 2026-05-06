import { SeededRandom } from '../../engine/math/seeded.random.ts';
import type { Op } from './cosmetics.ops.ts';
import { renderOps, preloadOps } from './cosmetics.ops.ts';
import rawLeaks from '../../assets/photo.lightLeaks.json';

export interface LightLeakDef {
  id: string;
  label: string;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
}

interface RawLeak { id: string; label: string; layers: Op[]; }
interface RawLeakConfig { items: RawLeak[]; }

function buildLeak(raw: RawLeak): LightLeakDef {
  preloadOps(raw.layers);

  return {
    id: raw.id,
    label: raw.label,
    draw: (ctx, x, y, w, h) => renderOps(ctx, raw.layers, { left: x, top: y, width: w, height: h }),
  };
}

export const LIGHT_LEAKS: LightLeakDef[] = (rawLeaks as RawLeakConfig).items.map(buildLeak);
const LEAK_BY_ID = new Map<string, LightLeakDef>(LIGHT_LEAKS.map(l => [l.id, l]));

export function getLightLeak(id: string): LightLeakDef {
  return LEAK_BY_ID.get(id) ?? LIGHT_LEAKS[0];
}

export function drawVignette(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, intensity: number): void {
  if (intensity <= 0.001) return;

  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const inner = Math.min(w, h) * 0.35;
  const outer = Math.hypot(w, h) * 0.55;
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);

  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${Math.min(0.85, intensity * 0.95)})`);

  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

let _grainCanvas: HTMLCanvasElement | null = null;
let _grainSeed = 0;

function ensureGrainTile(seed: number): HTMLCanvasElement {
  if (_grainCanvas && _grainSeed === seed) return _grainCanvas;

  const size = 96;
  const c = document.createElement('canvas');

  c.width = size;
  c.height = size;

  const cx = c.getContext('2d')!;
  const img = cx.createImageData(size, size);
  const rng = new SeededRandom(seed);

  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rng.float(0, 256));

    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }

  cx.putImageData(img, 0, 0);

  _grainCanvas = c;
  _grainSeed = seed;

  return c;
}

export function drawGrain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, intensity: number, seed = 1): void {
  if (intensity <= 0.001) return;

  const tile = ensureGrainTile(seed);

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = Math.min(0.5, intensity * 0.55);

  const pattern = ctx.createPattern(tile, 'repeat');

  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.translate(x, y);
    ctx.fillRect(0, 0, w, h);
  }

  ctx.restore();
}

export function drawBloom(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, intensity: number): void {
  if (intensity <= 0.001) return;

  const blurPx = 2 + intensity * 6;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.85, intensity * 0.85);
  ctx.filter = `blur(${blurPx.toFixed(2)}px) brightness(1.4) contrast(1.1)`;
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.filter = 'none';
  ctx.restore();
}
