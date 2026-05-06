export const THEME = {
  bg: '#0d1422',
  panel: 'rgba(20,28,46,0.86)',
  panelHi: 'rgba(36,48,72,0.55)',
  panelStroke: 'rgba(180,200,255,0.16)',
  panelStrokeHi: 'rgba(232,201,138,0.32)',
  textPrimary: '#eef3ff',
  textMuted: 'rgba(184,196,220,0.85)',
  textFaint: 'rgba(184,196,220,0.55)',
  accent: '#e8c98a',
  accentSoft: 'rgba(232,201,138,0.55)',
  accentDeep: '#c9a86a',
  glow: 'rgba(255,210,140,0.18)',
  selectionRing: 'rgba(255,210,140,0.95)',
  shadow: 'rgba(0,4,18,0.55)',
  backdrop: 'rgba(4,6,16,0.78)',
  polaroidPaper: '#f6f1e6',
  polaroidInk: 'rgba(80,60,45,0.78)',
  fontSans: '"Inter", system-ui, -apple-system, sans-serif',
  fontSerif: '"Cormorant Garamond", "Georgia", serif',
} as const;

export type Theme = typeof THEME;

export function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius = 14, highlighted = false): void {
  ctx.save();
  ctx.shadowColor = THEME.shadow;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = THEME.panel;
  roundedPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  const grad = ctx.createLinearGradient(x, y, x, y + Math.min(h * 0.45, 80));

  grad.addColorStop(0, THEME.panelHi);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  roundedPath(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, Math.min(h * 0.45, 80));
  ctx.restore();

  ctx.strokeStyle = highlighted ? THEME.panelStrokeHi : THEME.panelStroke;
  ctx.lineWidth = 1;
  roundedPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
}

export function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();

  if (r <= 0) {
    ctx.rect(x, y, w, h);

    return;
  }

  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
