import type { PhotoCustomization, PolaroidGeometry } from './photo.types.ts';
import { getFrame, computeFrameSize } from './photo.frames.ts';
import { getFilter } from './photo.filters.ts';
import { drawVignette, drawGrain, drawBloom, getLightLeak } from './photo.effects.ts';
import { THEME, roundedPath } from './photo.theme.ts';

export interface ComposeRequest {
  base: HTMLCanvasElement;
  target: HTMLCanvasElement;
  customization: PhotoCustomization;
  geometry: PolaroidGeometry;
  caption: string;
  dpr: number;
}

const FONT_BY_ID: Record<string, string> = {
  serif: THEME.fontSerif,
  sans: THEME.fontSans,
};

export function ensureComposeCanvas(existing: HTMLCanvasElement | null, cardW: number, cardH: number, dpr: number): HTMLCanvasElement {
  const wantW = Math.max(1, Math.round(cardW * dpr));
  const wantH = Math.max(1, Math.round(cardH * dpr));

  if (existing && existing.width === wantW && existing.height === wantH) return existing;

  const c = existing ?? document.createElement('canvas');

  c.width = wantW;
  c.height = wantH;

  return c;
}

export function ensureBaseCanvas(existing: HTMLCanvasElement | null, viewportW: number, viewportH: number, dpr: number): HTMLCanvasElement {
  const wantW = Math.max(1, Math.round(viewportW * dpr));
  const wantH = Math.max(1, Math.round(viewportH * dpr));

  if (existing && existing.width === wantW && existing.height === wantH) return existing;

  const c = existing ?? document.createElement('canvas');

  c.width = wantW;
  c.height = wantH;

  return c;
}

export function composePolaroid(req: ComposeRequest): void {
  const { base, target, customization, geometry, caption, dpr } = req;
  const ctx = target.getContext('2d');

  if (!ctx) return;

  const frame = getFrame(customization.frameId);
  const layout = frame.layout;
  const cardW = geometry.cardW;
  const cardH = geometry.cardH;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.scale(dpr, dpr);

  if (frame.drawPaper) {
    frame.drawPaper(ctx, 0, 0, cardW, cardH, layout);
  } else {
    ctx.save();

    roundedPath(ctx, 0, 0, cardW, cardH, layout.borderRadius);

    ctx.clip();
    ctx.fillStyle = layout.paperColor;
    ctx.fillRect(0, 0, cardW, cardH);
    ctx.restore();
  }

  const vpX = layout.paddingLeft;
  const vpY = layout.paddingTop;
  const vpW = cardW - layout.paddingLeft - layout.paddingRight;
  const vpH = cardH - layout.paddingTop - layout.captionH;

  if (vpW > 0 && vpH > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(vpX, vpY, vpW, vpH);
    ctx.clip();

    ctx.fillStyle = '#040814';
    ctx.fillRect(vpX, vpY, vpW, vpH);

    const filter = getFilter(customization.filterId).cssFilter;

    ctx.filter = filter || 'none';
    ctx.drawImage(base, vpX, vpY, vpW, vpH);
    ctx.filter = 'none';

    if (customization.bloomIntensity > 0.001) {
      drawBloom(ctx, base, 0, 0, base.width, base.height, vpX, vpY, vpW, vpH, customization.bloomIntensity);
    }

    const leak = getLightLeak(customization.lightLeakId);

    leak.draw(ctx, vpX, vpY, vpW, vpH);

    drawVignette(ctx, vpX, vpY, vpW, vpH, customization.vignetteIntensity);
    drawGrain(ctx, vpX, vpY, vpW, vpH, customization.grainIntensity, 1);

    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX + 0.5, vpY + 0.5, vpW - 1, vpH - 1);
  }

  if (frame.drawDecorations) {
    frame.drawDecorations(ctx, 0, 0, cardW, cardH, layout);
  }

  drawCaption(ctx, customization, layout, cardW, cardH, caption);

  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  c: PhotoCustomization,
  layout: { paddingTop: number; paddingLeft: number; paddingRight: number; captionH: number; inkColor: string },
  cardW: number,
  cardH: number,
  caption: string
): void {
  if (layout.captionH <= 4) return;

  const captionY = cardH - layout.captionH;
  const cx = cardW * 0.5;
  const fontFamily = FONT_BY_ID.serif;
  const usableW = Math.max(40, cardW - layout.paddingLeft - layout.paddingRight - 8);

  ctx.save();
  ctx.fillStyle = layout.inkColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines: string[] = [];
  const main = (caption || c.customBorderText || '').trim();

  if (main) lines.push(main);

  if (lines.length === 0) {
    setFontFitting(ctx, lines[0], Math.min(44, layout.captionH * 0.55), '', fontFamily, usableW);

    ctx.fillText('', cx, captionY + layout.captionH * 0.5);
  } else if (lines.length === 1) {
    setFontFitting(ctx, lines[0], Math.min(44, layout.captionH * 0.55), '', fontFamily, usableW);

    ctx.fillText(lines[0], cx, captionY + layout.captionH * 0.5);
  } else {
    setFontFitting(ctx, lines[0], Math.min(36, layout.captionH * 0.42), '', fontFamily, usableW);

    ctx.fillText(lines[0], cx, captionY + layout.captionH * 0.36);
    ctx.globalAlpha = 0.7;

    setFontFitting(ctx, lines[1], Math.min(22, layout.captionH * 0.26), '', fontFamily, usableW);

    ctx.fillText(lines[1], cx, captionY + layout.captionH * 0.72);
  }

  ctx.restore();
}

function setFontFitting(ctx: CanvasRenderingContext2D, text: string, desiredSize: number, style: string, family: string, maxWidth: number): void {
  const prefix = style ? `${style} ` : '';

  ctx.font = `${prefix}${desiredSize}px ${family}`;

  const measured = ctx.measureText(text).width;

  if (measured > maxWidth) {
    const shrunk = Math.max(10, desiredSize * (maxWidth / measured));

    ctx.font = `${prefix}${shrunk}px ${family}`;
  }
}

export { computeFrameSize };
