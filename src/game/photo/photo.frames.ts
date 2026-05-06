import type { Op } from './cosmetics.ops.ts';
import { renderOps, preloadOps } from './cosmetics.ops.ts';
import rawConfig from '../../assets/photo.frames.json';

export interface FrameLayout {
  paddingTop: number;
  paddingLeft: number;
  paddingRight: number;
  captionH: number;
  borderRadius: number;
  paperColor: string;
  inkColor: string;
  viewportAspect: number;
}

export interface FrameDef {
  id: string;
  label: string;
  layout: FrameLayout;
  drawPaper?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, layout: FrameLayout) => void;
  drawDecorations?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, layout: FrameLayout) => void;
}

interface RawFrameDef {
  id: string;
  label: string;
  layout: FrameLayout;
  paper?: {
    layers: Op[]
  };
  decorations?: Op[];
}

interface RawConfig { items: RawFrameDef[]; }

function buildFrame(raw: RawFrameDef): FrameDef {
  if (raw.paper?.layers) preloadOps(raw.paper.layers);
  if (raw.decorations) preloadOps(raw.decorations);

  const def: FrameDef = { id: raw.id, label: raw.label, layout: raw.layout };

  if (raw.paper?.layers) {
    const layers = raw.paper.layers;

    def.drawPaper = (ctx, x, y, w, h, layout) => {
      ctx.save();
      ctx.beginPath();

      const r = Math.max(0, Math.min(layout.borderRadius, w / 2, h / 2));

      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = layout.paperColor;
      ctx.fillRect(x, y, w, h);

      renderOps(ctx, layers, {
        left: x,
        top: y,
        width: w,
        height: h
      });

      ctx.restore();
    };
  }

  if (raw.decorations) {
    const layers = raw.decorations;

    def.drawDecorations = (ctx, x, y, w, h) => {
      renderOps(ctx, layers, {
        left: x,
        top: y,
        width: w,
        height: h
      });
    };
  }

  return def;
}

export const FRAMES: FrameDef[] = (rawConfig as RawConfig).items.map(buildFrame);
const FRAME_BY_ID = new Map<string, FrameDef>(FRAMES.map(f => [f.id, f]));

export function getFrame(id: string): FrameDef {
  return FRAME_BY_ID.get(id) ?? FRAMES[0];
}

export function computeFrameSize(frameId: string, innerViewport: number,): { cardW: number; cardH: number; viewportW: number; viewportH: number; layout: FrameLayout } {
  const frame = getFrame(frameId);
  const layout = frame.layout;
  const ratio = layout.viewportAspect;
  const viewportW = ratio >= 1 ? innerViewport : Math.round(innerViewport * ratio);
  const viewportH = ratio >= 1 ? Math.round(innerViewport / ratio) : innerViewport;

  return {
    cardW: viewportW + layout.paddingLeft + layout.paddingRight,
    cardH: viewportH + layout.paddingTop + layout.captionH,
    viewportW,
    viewportH,
    layout,
  };
}
