import type { GameWorld } from '../../engine/types.ts';
import { submit } from '../../engine/renderer/index.ts';
import { submitPath } from '../../engine/trail/index.ts';
import { clamp, lerp, smootherstep } from '../../engine/math/math.utils.ts';
import type { ConstellationState, RGB } from './constellation.types.ts';

const STAR_LAYER = 45;
const SEGMENT_LAYER = 50;

const ATMOSPHERE_BASE: RGB = { r: 139, g: 166, b: 240 };
const HALO_BASE: RGB = { r: 168, g: 192, b: 255 };
const BLOOM_BASE: RGB = { r: 220, g: 235, b: 255 };
const CORE_BASE: RGB = { r: 240, g: 246, b: 255 };

function mixRgb(base: RGB, hue: RGB | null, t: number): RGB {
  if (!hue) return base;

  return {
    r: Math.round(base.r + (hue.r - base.r) * t),
    g: Math.round(base.g + (hue.g - base.g) * t),
    b: Math.round(base.b + (hue.b - base.b) * t),
  };
}

function rgbToHex(c: RGB): string {
  const r = c.r.toString(16).padStart(2, '0');
  const g = c.g.toString(16).padStart(2, '0');
  const b = c.b.toString(16).padStart(2, '0');

  return `#${r}${g}${b}`;
}

function drawCrossFlare(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, thickness: number, alpha: number, rotation: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const half = thickness * 0.5;
  const hg = ctx.createLinearGradient(-length, 0, length, 0);

  hg.addColorStop(0.00, 'rgba(255,255,255,0)');
  hg.addColorStop(0.45, `rgba(255,250,255,${alpha})`);
  hg.addColorStop(0.55, `rgba(255,250,255,${alpha})`);
  hg.addColorStop(1.00, 'rgba(255,255,255,0)');

  ctx.fillStyle = hg;
  ctx.fillRect(-length, -half, length * 2, thickness);

  const vg = ctx.createLinearGradient(0, -length, 0, length);

  vg.addColorStop(0.00, 'rgba(255,255,255,0)');
  vg.addColorStop(0.45, `rgba(255,250,255,${alpha})`);
  vg.addColorStop(0.55, `rgba(255,250,255,${alpha})`);
  vg.addColorStop(1.00, 'rgba(255,255,255,0)');

  ctx.fillStyle = vg;
  ctx.fillRect(-half, -length, thickness, length * 2);

  ctx.restore();
}

export function drawConnectableStars(world: GameWorld, state: ConstellationState, time: number): void {
  const closed = state.closed;
  const hue = state.hue;
  const auraInner = mixRgb({ r: 220, g: 232, b: 255 }, hue, 0.45);
  const auraMid = mixRgb({ r: 200, g: 220, b: 255 }, hue, 0.65);
  const auraOuter = mixRgb({ r: 160, g: 180, b: 255 }, hue, 0.75);

  for (let i = 0; i < state.stars.length; i++) {
    const s = state.stars[i];
    const pulse = 0.85 + 0.15 * Math.sin(time * s.pulseSpeed + s.pulsePhase);
    const selected = state.selectionPath.includes(i);
    const selectionPulse = selected ? 0.5 + 0.5 * Math.sin(time * 1.8 + s.pulsePhase) : 0;
    const haloBoost = selected ? (closed ? 1.18 : 1.10) : 1.0;
    const alphaBoost = selected ? (closed ? 1.20 : 1.10) : 1.0;
    const halo = s.haloRadius * pulse * haloBoost;
    const core = s.radius * (selected ? 0.62 : 0.55);
    const auraRadius = s.haloRadius * (0.85 + 0.05 * selectionPulse) * (closed ? 1.05 : 1.0);
    const flareLength = selected ? s.haloRadius * (0.40 + 0.05 * selectionPulse) : s.radius * 1.6;
    const flareAlpha = selected ? 0.30 + 0.10 * selectionPulse : 0.18;
    const flareThickness = selected ? 1.0 : 0.9;
    const flareRotation = time * (selected ? 0.22 : 0.10) + s.pulsePhase;
    const drawRadius = Math.max(halo, auraRadius, flareLength);

    submit(world, STAR_LAYER, selected ? 1 : 0, (ctx) => {
      const { r, g, b } = s.color;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, halo);

      grad.addColorStop(0.00, `rgba(${r},${g},${b},${Math.min(1, 0.55 * pulse * alphaBoost)})`);
      grad.addColorStop(0.20, `rgba(${r},${g},${b},${Math.min(1, 0.30 * pulse * alphaBoost)})`);
      grad.addColorStop(0.55, `rgba(${r},${g},${b},${Math.min(1, 0.10 * pulse * alphaBoost)})`);
      grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, halo, 0, Math.PI * 2);
      ctx.fill();

      if (selected) {
        const aura = ctx.createRadialGradient(s.x, s.y, s.radius * 0.6, s.x, s.y, auraRadius);

        aura.addColorStop(0.00, `rgba(${auraInner.r},${auraInner.g},${auraInner.b},0)`);
        aura.addColorStop(0.55, `rgba(${auraMid.r},${auraMid.g},${auraMid.b},${0.08 + 0.04 * selectionPulse})`);
        aura.addColorStop(1.00, `rgba(${auraOuter.r},${auraOuter.g},${auraOuter.b},0)`);

        ctx.fillStyle = aura;
        ctx.beginPath();
        ctx.arc(s.x, s.y, auraRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      drawCrossFlare(ctx, s.x, s.y, flareLength, flareThickness, flareAlpha, flareRotation);

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      ctx.beginPath();
      ctx.arc(s.x, s.y, core, 0, Math.PI * 2);
      ctx.fill();

      if (selected) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255,255,255,${0.30 + 0.10 * selectionPulse})`;

        ctx.beginPath();
        ctx.arc(s.x, s.y, core * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
      }
    }, true, 1, { x: s.x - drawRadius, y: s.y - drawRadius, w: drawRadius * 2, h: drawRadius * 2 });
  }
}

interface LineStyle {
  atmosphereWidth: number;
  atmosphereAlpha: number;
  haloWidth: number;
  haloAlpha: number;
  bloomWidth: number;
  bloomAlpha: number;
  coreWidth: number;
  coreAlpha: number;
}

function drawAnimeLine(world: GameWorld, fromX: number, fromY: number, toX: number, toY: number, time: number, segIdx: number, style: LineStyle, hue: RGB | null): void {
  const points = [{ x: fromX, y: fromY }, { x: toX, y: toY }];
  const wob = Math.sin(time * 1.4 + segIdx * 0.7);
  const wob2 = Math.sin(time * 2.1 + segIdx * 1.3);
  const atmosphereColor = rgbToHex(mixRgb(ATMOSPHERE_BASE, hue, 0.55));
  const haloColor = rgbToHex(mixRgb(HALO_BASE, hue, 0.65));
  const bloomColor = rgbToHex(mixRgb(BLOOM_BASE, hue, 0.45));
  const coreColor = rgbToHex(mixRgb(CORE_BASE, hue, 0.18));

  submitPath(world, SEGMENT_LAYER, 0, points, {
    width: style.atmosphereWidth + 5 * wob,
    color: atmosphereColor,
    alpha: style.atmosphereAlpha + 0.02 * wob2,
    blendMode: 'lighter',
    roundCap: true,
  }, true, 1);

  submitPath(world, SEGMENT_LAYER, 1, points, {
    width: style.haloWidth + 3 * wob,
    color: haloColor,
    alpha: style.haloAlpha + 0.04 * wob2,
    blendMode: 'lighter',
    roundCap: true,
  }, true, 1);

  submitPath(world, SEGMENT_LAYER, 2, points, {
    width: style.bloomWidth,
    color: bloomColor,
    alpha: style.bloomAlpha,
    blendMode: 'lighter',
    roundCap: true,
  }, true, 1);

  submitPath(world, SEGMENT_LAYER, 3, points, {
    width: style.coreWidth,
    color: coreColor,
    alpha: style.coreAlpha,
    blendMode: 'source-over',
    roundCap: true,
  }, true, 1);
}

const COMMITTED_STYLE: LineStyle = {
  atmosphereWidth: 28,
  atmosphereAlpha: 0.06,
  haloWidth: 14,
  haloAlpha: 0.18,
  bloomWidth: 5,
  bloomAlpha: 0.55,
  coreWidth: 1.6,
  coreAlpha: 0.95,
};

const CLOSED_STYLE: LineStyle = {
  atmosphereWidth: 32,
  atmosphereAlpha: 0.09,
  haloWidth: 16,
  haloAlpha: 0.24,
  bloomWidth: 6,
  bloomAlpha: 0.65,
  coreWidth: 1.8,
  coreAlpha: 1.0,
};

const RUBBER_STYLE: LineStyle = {
  atmosphereWidth: 22,
  atmosphereAlpha: 0.04,
  haloWidth: 11,
  haloAlpha: 0.13,
  bloomWidth: 4,
  bloomAlpha: 0.32,
  coreWidth: 1.3,
  coreAlpha: 0.55,
};

function drawSoftDot(world: GameWorld, x: number, y: number, radius: number, alpha: number, order: number, hue: RGB | null): void {
  const mid = mixRgb({ r: 225, g: 235, b: 255 }, hue, 0.55);
  const tail = mixRgb({ r: 170, g: 195, b: 255 }, hue, 0.7);

  submit(world, SEGMENT_LAYER, order, (ctx) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);

    grad.addColorStop(0.00, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.45, `rgba(${mid.r},${mid.g},${mid.b},${alpha * 0.55})`);
    grad.addColorStop(1.00, `rgba(${tail.r},${tail.g},${tail.b},0)`);

    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }, true, 1, { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
}

export function drawSegments(world: GameWorld, state: ConstellationState, time: number): void {
  const style = state.closed ? CLOSED_STYLE : COMMITTED_STYLE;
  const hue = state.hue;

  for (let i = 0; i < state.segments.length; i++) {
    const seg = state.segments[i];
    const from = state.stars[seg.fromIdx];
    const to = state.stars[seg.toIdx];
    const elapsed = time - seg.bornAt;
    const t = clamp(elapsed / seg.duration, 0, 1);
    const e = smootherstep(t);
    const endX = lerp(from.x, to.x, e);
    const endY = lerp(from.y, to.y, e);

    drawAnimeLine(world, from.x, from.y, endX, endY, time, i, style, hue);

    if (!seg.done) {
      drawSoftDot(world, endX, endY, 7, 0.85, 4, hue);
    }
  }
}

export function drawRubberBand(world: GameWorld, state: ConstellationState, time: number): void {
  if (!state.drawing.active) return;

  const fromIdx = state.drawing.pendingStartIdx !== -1 ? state.drawing.pendingStartIdx : (state.selectionPath.length > 0 ? state.selectionPath[state.selectionPath.length - 1] : -1);

  if (fromIdx === -1) return;

  const from = state.stars[fromIdx];
  const cursor = state.drawing.cursorWorld;
  const dx = cursor.x - from.x;
  const dy = cursor.y - from.y;

  if (dx * dx + dy * dy < 1) return;

  drawAnimeLine(world, from.x, from.y, cursor.x, cursor.y, time, state.segments.length, RUBBER_STYLE, state.hue);
  drawSoftDot(world, cursor.x, cursor.y, 8, 0.7, 5, state.hue);
}
