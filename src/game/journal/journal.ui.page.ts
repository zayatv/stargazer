import type { SavedPhoto } from '../photo/photo.types.ts';
import { THEME } from '../photo/photo.theme.ts';
import { PHOTOS_PER_PAGE, PHOTOS_PER_SPREAD } from './journal.types.ts';
import { getOrCreateImage } from './journal.image.cache.ts';
import { roundRectPath } from './journal.ui.panels.ts';

export type PageSide = 'left' | 'right';

export interface PageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAPER_FILL = '#f6efde';
const PAPER_FILL_DARK = '#ebe2cc';
const INK_PRIMARY = 'rgba(60,46,32,0.92)';
const INK_MUTED = 'rgba(80,62,42,0.62)';
const INK_FAINT = 'rgba(80,62,42,0.32)';

export function drawPaper(ctx: CanvasRenderingContext2D, rect: PageRect, side: PageSide): void {
  ctx.save();

  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y);

  if (side === 'left') {
    grad.addColorStop(0, PAPER_FILL);
    grad.addColorStop(1, PAPER_FILL_DARK);
  } else {
    grad.addColorStop(0, PAPER_FILL_DARK);
    grad.addColorStop(1, PAPER_FILL);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const spineX = side === 'left' ? rect.x + rect.w : rect.x;
  const dir = side === 'left' ? -1 : 1;
  const shadowGrad = ctx.createLinearGradient(spineX, 0, spineX + dir * 32, 0);

  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.22)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = shadowGrad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.restore();
}

export function drawCoverPage(ctx: CanvasRenderingContext2D, rect: PageRect, side: PageSide): void {
  if (side === 'left') return;

  const REFERENCE_W = 480;
  const scale = Math.max(0.55, Math.min(1.15, rect.w / REFERENCE_W));
  const titlePx = Math.round(54 * scale);
  const subtitlePx = Math.round(18 * scale);
  const starR = Math.round(6 * scale);

  ctx.save();
  ctx.fillStyle = INK_PRIMARY;
  ctx.font = `${titlePx}px ${THEME.fontSerif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Your Sky', rect.x + rect.w * 0.5, rect.y + rect.h * 0.42);
  ctx.fillText('Journal', rect.x + rect.w * 0.5, rect.y + rect.h * 0.42 + Math.round(titlePx * 1.1));

  ctx.fillStyle = INK_MUTED;
  ctx.font = `italic ${subtitlePx}px ${THEME.fontSerif}`;

  const subtitle = 'a place for the skies you remember';
  const maxSubtitleW = rect.w - 24;

  drawCenteredWrapped(ctx, subtitle, rect.x + rect.w * 0.5, rect.y + rect.h * 0.62, maxSubtitleW, subtitlePx + 4);

  ctx.fillStyle = INK_FAINT;

  drawSmallStar(ctx, rect.x + rect.w * 0.5, rect.y + rect.h * 0.74, starR);

  ctx.restore();
}

function drawCenteredWrapped(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lineH: number,): void {
  const words = text.split(' ');
  const lines: string[] = [];

  let current = '';

  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;

    if (ctx.measureText(trial).width > maxW && current) {
      lines.push(current);
      current = w;
    } else {
      current = trial;
    }
  }

  if (current) lines.push(current);

  const totalH = lines.length * lineH;

  let y = cy - totalH * 0.5 + lineH * 0.5;

  for (const line of lines) {
    ctx.fillText(line, cx, y);

    y += lineH;
  }
}

function drawSmallStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();

  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;

    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }

  ctx.lineWidth = 1.2;
  ctx.strokeStyle = INK_FAINT;
  ctx.stroke();
}

export function drawSpreadContent(ctx: CanvasRenderingContext2D, rect: PageRect, side: PageSide, spreadIndex: number, photos: SavedPhoto[]): void {
  for (const slot of slotsForSpread(rect, side, spreadIndex, photos)) {
    drawSlot(ctx, slot);
  }

  ctx.save();
  ctx.fillStyle = INK_FAINT;
  ctx.font = `italic 12px ${THEME.fontSerif}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const pageNum = (spreadIndex - 1) * 2 + (side === 'left' ? 1 : 2);

  ctx.fillText(`— ${pageNum} —`, rect.x + rect.w * 0.5, rect.y + rect.h - 14);
  ctx.restore();
}

export interface SlotLayout {
  photo: SavedPhoto | undefined;
  polaroidX: number;
  polaroidY: number;
  polaroidW: number;
  polaroidH: number;
  rotation: number;
  hasNote: boolean;
  peekHitX: number;
  peekHitY: number;
  peekHitW: number;
  peekHitH: number;
}

export function slotsForSpread(rect: PageRect, side: PageSide, spreadIndex: number, photos: SavedPhoto[]): SlotLayout[] {
  if (spreadIndex < 1) return [];

  const startPhoto = (spreadIndex - 1) * PHOTOS_PER_SPREAD + (side === 'left' ? 0 : PHOTOS_PER_PAGE);
  const slotsTopY = rect.y + 36;
  const slotH = (rect.h - 64) / PHOTOS_PER_PAGE;
  const out: SlotLayout[] = [];

  for (let i = 0; i < PHOTOS_PER_PAGE; i++) {
    const photo = photos[startPhoto + i];
    const slotY = slotsTopY + i * slotH;

    out.push(computeSlotLayout(photo, rect.x, slotY, rect.w, slotH));
  }

  return out;
}

const FALLBACK_ASPECT = 0.8;
const PEEK_OUT = 22;
const PEEK_VISUAL_W = 64;
const PEEK_VISUAL_H = 50;
const PEEK_HIT_PAD = 12;

function computeSlotLayout(photo: SavedPhoto | undefined, x: number, y: number, w: number, h: number): SlotLayout {
  const innerPadX = 18;
  const innerW = w - innerPadX * 2;
  const innerX = x + innerPadX;
  const slotMaxW = Math.min(innerW, 260);
  const slotMaxH = h * 0.86;
  const img = photo ? getOrCreateImage(photo) : null;
  const imgReady = !!img && img.complete && img.naturalWidth > 0;
  const aspect = imgReady && img ? img.naturalWidth / img.naturalHeight : FALLBACK_ASPECT;

  let polaroidW = slotMaxW;
  let polaroidH = polaroidW / aspect;

  if (polaroidH > slotMaxH) {
    polaroidH = slotMaxH;
    polaroidW = polaroidH * aspect;
  }

  const polaroidX = innerX + (innerW - polaroidW) * 0.5;
  const polaroidY = y + 8 + (slotMaxH - polaroidH) * 0.5;
  const rotSeed = photo ? hashString(photo.id) : 0;
  const rot = ((rotSeed % 1000) / 1000 - 0.5) * 0.06;
  const hasNote = !!photo?.note && photo.note.trim().length > 0;
  const peekVisX = polaroidX + polaroidW - PEEK_VISUAL_W * 0.4;
  const peekVisY = polaroidY + polaroidH - PEEK_VISUAL_H * 0.4;
  const peekHitX = peekVisX - PEEK_HIT_PAD;
  const peekHitY = peekVisY - PEEK_HIT_PAD;
  const peekHitW = PEEK_VISUAL_W + PEEK_OUT + PEEK_HIT_PAD * 2;
  const peekHitH = PEEK_VISUAL_H + PEEK_OUT + PEEK_HIT_PAD * 2;

  return {
    photo,
    polaroidX, polaroidY, polaroidW, polaroidH, rotation: rot,
    hasNote,
    peekHitX, peekHitY, peekHitW, peekHitH,
  };
}

function drawSlot(ctx: CanvasRenderingContext2D, slot: SlotLayout): void {
  const photo = slot.photo;

  if (!photo) {
    drawEmptySlot(ctx, slot.polaroidX, slot.polaroidY, slot.polaroidW, slot.polaroidH);

    return;
  }

  const cx = slot.polaroidX + slot.polaroidW * 0.5;
  const cy = slot.polaroidY + slot.polaroidH * 0.5;

  if (slot.hasNote) {
    drawNotePeek(ctx, slot);
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(slot.rotation);
  ctx.translate(-cx, -cy);

  const img = getOrCreateImage(photo);
  const imgReady = img.complete && img.naturalWidth > 0;

  if (imgReady) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(img, slot.polaroidX, slot.polaroidY, slot.polaroidW, slot.polaroidH);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(slot.polaroidX, slot.polaroidY, slot.polaroidW, slot.polaroidH);
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(slot.polaroidX + 6, slot.polaroidY + 6, slot.polaroidW - 12, slot.polaroidH - 12);
  }

  ctx.restore();
}

const NOTE_PAPER_FILL = '#fcefa9';
const NOTE_PAPER_EDGE = '#d8c468';
const NOTE_RULE = 'rgba(80,72,40,0.32)';
const NOTE_PAPER_SHADOW = 'rgba(0,0,0,0.22)';

function drawNotePeek(ctx: CanvasRenderingContext2D, slot: SlotLayout): void {
  const ax = slot.polaroidX + slot.polaroidW;
  const ay = slot.polaroidY + slot.polaroidH;
  const w = PEEK_VISUAL_W + PEEK_OUT;
  const h = PEEK_VISUAL_H + PEEK_OUT;
  const peekRot = slot.rotation + 0.18;

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(peekRot);

  const px = -w + PEEK_OUT;
  const py = -h + PEEK_OUT;

  ctx.save();
  ctx.shadowColor = NOTE_PAPER_SHADOW;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = NOTE_PAPER_FILL;
  ctx.fillRect(px, py, w, h);
  ctx.restore();

  ctx.strokeStyle = NOTE_PAPER_EDGE;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, w - 1, h - 1);

  ctx.strokeStyle = NOTE_RULE;
  ctx.lineWidth = 0.8;

  const visTop = py + h - PEEK_OUT - 8;

  for (let i = 0; i < 3; i++) {
    const ly = visTop + i * 8;

    if (ly > py + h - 4) break;

    ctx.beginPath();
    ctx.moveTo(px + 6, ly);
    ctx.lineTo(px + w - 6, ly);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath();
  ctx.moveTo(px + w - 9, py + h);
  ctx.lineTo(px + w, py + h);
  ctx.lineTo(px + w, py + h - 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function noteAtPoint(rect: PageRect, side: PageSide, spreadIndex: number, photos: SavedPhoto[], px: number, py: number): SavedPhoto | null {
  for (const slot of slotsForSpread(rect, side, spreadIndex, photos)) {
    if (!slot.hasNote || !slot.photo) continue;

    if (px >= slot.peekHitX && px <= slot.peekHitX + slot.peekHitW && py >= slot.peekHitY && py <= slot.peekHitY + slot.peekHitH) {
      return slot.photo;
    }
  }

  return null;
}

export function photoAtPoint(rect: PageRect, side: PageSide, spreadIndex: number, photos: SavedPhoto[], px: number, py: number): SavedPhoto | null {
  for (const slot of slotsForSpread(rect, side, spreadIndex, photos)) {
    if (!slot.photo) continue;

    if (px >= slot.polaroidX && px <= slot.polaroidX + slot.polaroidW && py >= slot.polaroidY && py <= slot.polaroidY + slot.polaroidH) {
      return slot.photo;
    }
  }

  return null;
}

function drawEmptySlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,): void {
  ctx.save();
  ctx.strokeStyle = INK_FAINT;
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, 4);
  ctx.stroke();
  ctx.restore();
}

function hashString(s: string): number {
  let h = 2166136261;

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }

  return h;
}

export function drawPage(ctx: CanvasRenderingContext2D, rect: PageRect, side: PageSide, spreadIndex: number, photos: SavedPhoto[],): void {
  drawPaper(ctx, rect, side);

  if (spreadIndex === 0) {
    drawCoverPage(ctx, rect, side);
  } else {
    drawSpreadContent(ctx, rect, side, spreadIndex, photos);
  }
}
