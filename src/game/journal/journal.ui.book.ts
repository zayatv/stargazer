import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import { registerInteraction, getInteractionState, createUIButton } from '../../engine/ui/index.ts';
import { InteractionState } from '../../engine/ui/ui.types.ts';
import { THEME } from '../photo/photo.theme.ts';
import type { JournalState, BookGeometry } from './journal.types.ts';
import {
  getOrCreateJournalOverlay,
  roundRectPath,
  JOURNAL_BACKDROP_LAYER,
  JOURNAL_BOOK_FRAME_LAYER,
  JOURNAL_PAGE_LAYER,
  JOURNAL_LEAF_LAYER,
  JOURNAL_EDGE_LAYER,
  JOURNAL_HUD_LAYER,
} from './journal.ui.panels.ts';
import { drawPage, noteAtPoint, photoAtPoint, type PageRect } from './journal.ui.page.ts';
import { showInspect, imageInspectTarget, noteInspectTarget } from '../inspect/index.ts';
import { getOrCreateImage } from './journal.image.cache.ts';

export interface BookOverlayHandle {
  nodes: LayoutNode[];
  leftPage: LayoutNode;
  rightPage: LayoutNode;
  leaf: LayoutNode;
  prevEdge: LayoutNode;
  nextEdge: LayoutNode;
  absorber: LayoutNode;
  closeBtn: LayoutNode;
}

function staticSpreadFor(state: JournalState, side: 'left' | 'right'): number {
  if (state.mode !== 'flipping' || state.flipDirection === 0) return state.spreadIndex;

  if (state.flipDirection === 1) {
    return side === 'right' ? state.flipToIndex : state.flipFromIndex;
  } else {
    return side === 'left' ? state.flipToIndex : state.flipFromIndex;
  }
}

export function computeBookGeometry(world: GameWorld): BookGeometry {
  const W = world.canvas.clientWidth;
  const H = world.canvas.clientHeight;

  const margin = 32;
  const maxW = Math.min(1100, W - margin * 2);
  const maxH = Math.min(720, H - margin * 2);
  const aspect = 11 / 7;

  let bookW = maxW;
  let bookH = bookW / aspect;

  if (bookH > maxH) {
    bookH = maxH;
    bookW = bookH * aspect;
  }

  const bookX = Math.round((W - bookW) * 0.5);
  const bookY = Math.round((H - bookH) * 0.5);
  const coverPad = 18;
  const pageW = (bookW - coverPad * 2) * 0.5;
  const pageH = bookH - coverPad * 2;
  const leftPageX = bookX + coverPad;
  const rightPageX = leftPageX + pageW;
  const spineX = leftPageX + pageW;
  const pageY = bookY + coverPad;

  return { bookX, bookY, bookW, bookH, pageW, pageH, spineX, leftPageX, rightPageX, pageY, pagesPerView: 2 };
}

export function buildBookOverlay(world: GameWorld, state: JournalState, onClose: () => void, onPrev: () => void, onNext: () => void): BookOverlayHandle {
  const overlay = getOrCreateJournalOverlay(world);
  const nodes: LayoutNode[] = [];

  const backdrop = createNode(world.layout, 'journal-backdrop');

  configureNode(world.layout, backdrop, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_BACKDROP_LAYER,
    order: 0,
    onRender: (ctx, _n) => {
      const W = world.canvas.clientWidth;
      const H = world.canvas.clientHeight;
      const a = 0.85 * Math.max(0, Math.min(1, state.entryProgress));

      ctx.save();
      ctx.fillStyle = `rgba(4,6,16,${a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, backdrop);
  registerInteraction(world.ui, backdrop, {
    onTap: () => onClose()
  });

  nodes.push(backdrop);

  const bookFrame = createNode(world.layout, 'journal-book-frame');

  configureNode(world.layout, bookFrame, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_BOOK_FRAME_LAYER,
    order: 0,
    onRender: (ctx, _n) => {
      const g = state.geometry;
      const ep = Math.max(0, Math.min(1, state.entryProgress));
      const scale = 0.92 + 0.08 * ep;
      const cx = g.bookX + g.bookW * 0.5;
      const cy = g.bookY + g.bookH * 0.5;

      ctx.save();
      ctx.globalAlpha = ep;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#3a2a1c';
      ctx.beginPath();
      roundRectPath(ctx, g.bookX - 8, g.bookY - 6, g.bookW + 16, g.bookH + 14, 12);
      ctx.fill();
      ctx.restore();

      const coverGrad = ctx.createLinearGradient(g.bookX, g.bookY, g.bookX, g.bookY + g.bookH);

      coverGrad.addColorStop(0, '#4a3520');
      coverGrad.addColorStop(0.5, '#3a2818');
      coverGrad.addColorStop(1, '#2a1c0f');
      ctx.fillStyle = coverGrad;
      ctx.beginPath();
      roundRectPath(ctx, g.bookX - 8, g.bookY - 6, g.bookW + 16, g.bookH + 14, 12);
      ctx.fill();

      ctx.strokeStyle = 'rgba(232,201,138,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRectPath(ctx, g.bookX - 6, g.bookY - 4, g.bookW + 12, g.bookH + 10, 10);
      ctx.stroke();

      if (g.pagesPerView === 2) {
        const spineGrad = ctx.createLinearGradient(g.spineX - 24, 0, g.spineX + 24, 0);

        spineGrad.addColorStop(0, 'rgba(0,0,0,0)');
        spineGrad.addColorStop(0.5, 'rgba(0,0,0,0.55)');
        spineGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = spineGrad;
        ctx.fillRect(g.spineX - 24, g.bookY, 48, g.bookH);
      }

      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(g.bookX - 4, g.bookY + 4, 4, g.bookH - 8);
      ctx.fillRect(g.bookX + g.bookW, g.bookY + 4, 4, g.bookH - 8);

      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, bookFrame);

  nodes.push(bookFrame);

  const leftPage = createNode(world.layout, 'journal-left-page');

  configureNode(world.layout, leftPage, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_PAGE_LAYER,
    order: 0,
    onRender: (ctx, _n) => {
      const g = state.geometry;
      const ep = Math.max(0, Math.min(1, state.entryProgress));

      if (ep <= 0) return;

      ctx.save();
      ctx.globalAlpha = ep;

      const rect: PageRect = { x: g.leftPageX, y: g.pageY, w: g.pageW, h: g.pageH };

      drawPage(ctx, rect, 'left', staticSpreadFor(state, 'left'), state.photos);

      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, leftPage);

  nodes.push(leftPage);

  const rightPage = createNode(world.layout, 'journal-right-page');

  configureNode(world.layout, rightPage, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_PAGE_LAYER,
    order: 1,
    onRender: (ctx, _n) => {
      const g = state.geometry;
      const ep = Math.max(0, Math.min(1, state.entryProgress));
      if (ep <= 0) return;
      ctx.save();
      ctx.globalAlpha = ep;

      const rect: PageRect = { x: g.rightPageX, y: g.pageY, w: g.pageW, h: g.pageH };

      drawPage(ctx, rect, 'right', staticSpreadFor(state, 'right'), state.photos);

      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, rightPage);

  nodes.push(rightPage);

  const leaf = createNode(world.layout, 'journal-leaf');

  configureNode(world.layout, leaf, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_LEAF_LAYER,
    order: 0,
    visible: false,
    onRender: (ctx, _n) => {
      if (state.mode !== 'flipping') return;

      drawLeaf(ctx, state);
    },
  });

  appendChild(world.layout, overlay, leaf);

  nodes.push(leaf);

  const absorber = createNode(world.layout, 'journal-absorber');

  configureNode(world.layout, absorber, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fixed,
    heightMode: SizeMode.Fixed,
  });

  appendChild(world.layout, overlay, absorber);

  registerInteraction(world.ui, absorber, {
    onTap: (_n, w) => {
      if (state.mode !== 'reading') return;

      const px = w.input.pointer.x;
      const py = w.input.pointer.y;
      const g = state.geometry;
      const leftRect: PageRect = { x: g.leftPageX, y: g.pageY, w: g.pageW, h: g.pageH };
      const rightRect: PageRect = { x: g.rightPageX, y: g.pageY, w: g.pageW, h: g.pageH };
      const noteHit = noteAtPoint(leftRect, 'left', state.spreadIndex, state.photos, px, py) ?? noteAtPoint(rightRect, 'right', state.spreadIndex, state.photos, px, py);

      if (noteHit?.note) {
        showInspect(w, noteInspectTarget(noteHit.note));

        return;
      }

      const photoHit = photoAtPoint(leftRect, 'left', state.spreadIndex, state.photos, px, py) ?? photoAtPoint(rightRect, 'right', state.spreadIndex, state.photos, px, py);

      if (photoHit) {
        showInspect(w, imageInspectTarget(getOrCreateImage(photoHit)));

        return;
      }
    },
  });

  nodes.push(absorber);

  const prevEdgeHandle = createUIButton(world, {
    parent: overlay,
    id: 'journal-prev-edge',
    width: 0,
    height: 0,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    layoutKind: LayoutKind.Absolute,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_EDGE_LAYER,
    order: 0,
    isEnabled: () => state.entryProgress > 0 && state.mode === 'reading' && state.spreadIndex > 0,
    draw: (ctx) => drawEdgeHint(ctx, state, 'prev'),
    onTap: () => onPrev(),
    clickSoundKey: null
  });

  const prevEdge = prevEdgeHandle.node;

  nodes.push(prevEdge);

  const nextEdgeHandle = createUIButton(world, {
    parent: overlay,
    id: 'journal-next-edge',
    width: 0,
    height: 0,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    layoutKind: LayoutKind.Absolute,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_EDGE_LAYER,
    order: 1,
    isEnabled: () => state.entryProgress > 0 && state.mode === 'reading' && state.spreadIndex < state.spreadCount - 1,
    draw: (ctx) => drawEdgeHint(ctx, state, 'next'),
    onTap: () => onNext(),
    clickSoundKey: null
  });

  const nextEdge = nextEdgeHandle.node;

  nodes.push(nextEdge);

  configureNode(world.layout, prevEdge, {
    widthMode: SizeMode.Fixed,
    heightMode: SizeMode.Fixed,
  });

  configureNode(world.layout, nextEdge, {
    widthMode: SizeMode.Fixed,
    heightMode: SizeMode.Fixed,
  });

  const CLOSE_SIZE = 36;
  const closeBtnHandle = createUIButton(world, {
    parent: overlay,
    id: 'journal-close',
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    layoutKind: LayoutKind.Absolute,
    layer: JOURNAL_HUD_LAYER,
    order: 0,
    isEnabled: () => state.entryProgress > 0,
    draw: (ctx, n) => {
      const ep = Math.max(0, Math.min(1, state.entryProgress));

      if (ep <= 0) return;

      const c = n.computed;
      const interaction = getInteractionState(world.ui, n);
      const cx = c.absX + c.width * 0.5;
      const cy = c.absY + c.height * 0.5;
      const r = c.width * 0.5;

      ctx.save();
      ctx.globalAlpha = ep;
      ctx.fillStyle = interaction === InteractionState.Hovered ? 'rgba(50,40,28,0.92)' : 'rgba(20,28,46,0.78)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = THEME.accentSoft;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1.6;

      const k = r * 0.42;

      ctx.beginPath();
      ctx.moveTo(cx - k, cy - k);
      ctx.lineTo(cx + k, cy + k);
      ctx.moveTo(cx + k, cy - k);
      ctx.lineTo(cx - k, cy + k);
      ctx.stroke();
      ctx.restore();
    },
    onTap: () => onClose(),
  });

  const closeBtn = closeBtnHandle.node;

  nodes.push(closeBtn);

  const indicator = createNode(world.layout, 'journal-indicator');

  configureNode(world.layout, indicator, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: JOURNAL_HUD_LAYER,
    order: 1,
    onRender: (ctx, _n) => {
      const ep = Math.max(0, Math.min(1, state.entryProgress));

      if (ep <= 0) return;

      const g = state.geometry;

      ctx.save();
      ctx.globalAlpha = ep * 0.85;
      ctx.fillStyle = THEME.accentSoft;
      ctx.font = `italic 13px ${THEME.fontSerif}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      const label = `${state.spreadIndex + 1} / ${state.spreadCount}`;

      ctx.fillText(label, g.bookX + g.bookW * 0.5, g.bookY + g.bookH + 28);
      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, indicator);

  nodes.push(indicator);

  applyGeometryToNodes(world, state, prevEdge, nextEdge, closeBtn, absorber);

  return { nodes, leftPage, rightPage, leaf, prevEdge, nextEdge, absorber, closeBtn };
}

export function applyGeometryToNodes(world: GameWorld, state: JournalState, prevEdge: LayoutNode, nextEdge: LayoutNode, closeBtn: LayoutNode, absorber: LayoutNode): void {
  const g = state.geometry;
  const EDGE_W = 60;

  configureNode(world.layout, prevEdge, {
    widthValue: EDGE_W,
    heightValue: g.bookH,
    absLeft: g.bookX - EDGE_W * 0.4,
    absTop: g.bookY,
  });

  configureNode(world.layout, nextEdge, {
    widthValue: EDGE_W,
    heightValue: g.bookH,
    absLeft: g.bookX + g.bookW - EDGE_W * 0.6,
    absTop: g.bookY,
  });

  configureNode(world.layout, closeBtn, {
    absLeft: g.bookX + g.bookW - 18,
    absTop: g.bookY - 18,
  });

  const ABSORB_PAD = 10;

  configureNode(world.layout, absorber, {
    widthValue: g.bookW + ABSORB_PAD * 2,
    heightValue: g.bookH + ABSORB_PAD * 2,
    absLeft: g.bookX - ABSORB_PAD,
    absTop: g.bookY - ABSORB_PAD,
  });
}

function drawEdgeHint(ctx: CanvasRenderingContext2D, state: JournalState, side: 'prev' | 'next'): void {
  const ep = Math.max(0, Math.min(1, state.entryProgress));

  if (ep <= 0) return;
  if (state.mode !== 'reading') return;

  const canFlip = side === 'prev' ? state.spreadIndex > 0 : state.spreadIndex < state.spreadCount - 1;

  if (!canFlip) return;

  const g = state.geometry;
  const cy = g.bookY + g.bookH * 0.5;
  const cx = side === 'prev' ? g.bookX - 14 : g.bookX + g.bookW + 14;
  const t = (Date.now() / 600) % (Math.PI * 2);
  const pulse = 0.55 + 0.25 * Math.sin(t);
  const r = 8;

  ctx.save();
  ctx.globalAlpha = ep * pulse;
  ctx.strokeStyle = 'rgba(232,201,138,0.85)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();

  if (side === 'prev') {
    ctx.moveTo(cx + r * 0.5, cy - r);
    ctx.lineTo(cx - r * 0.5, cy);
    ctx.lineTo(cx + r * 0.5, cy + r);
  } else {
    ctx.moveTo(cx - r * 0.5, cy - r);
    ctx.lineTo(cx + r * 0.5, cy);
    ctx.lineTo(cx - r * 0.5, cy + r);
  }

  ctx.stroke();
  ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, state: JournalState): void {
  const g = state.geometry;
  const fp = Math.max(0, Math.min(1, state.flipProgress));
  const theta = fp * Math.PI;
  const absCos = Math.abs(Math.cos(theta));
  const sinT = Math.sin(theta);
  const dir = state.flipDirection;
  const pastMid = theta > Math.PI / 2;

  let sourceSpread: number;
  let sourceSide: 'left' | 'right';

  if (dir === 1) {
    if (!pastMid) {
      sourceSpread = state.flipFromIndex;
      sourceSide = 'right';
    } else {
      sourceSpread = state.flipToIndex;
      sourceSide = 'left';
    }
  } else {
    if (!pastMid) {
      sourceSpread = state.flipFromIndex;
      sourceSide = 'left';
    } else {
      sourceSpread = state.flipToIndex;
      sourceSide = 'right';
    }
  }

  const onRight = (dir === 1 && !pastMid) || (dir === -1 && pastMid);
  const leafW = g.pageW * absCos;
  const leafX = onRight ? g.spineX : g.spineX - leafW;
  const srcRect: PageRect = sourceSide === 'left' ? { x: g.leftPageX,  y: g.pageY, w: g.pageW, h: g.pageH } : { x: g.rightPageX, y: g.pageY, w: g.pageW, h: g.pageH };

  ctx.save();
  ctx.beginPath();
  ctx.rect(leafX, srcRect.y, leafW, srcRect.h);
  ctx.clip();
  ctx.translate(leafX, 0);

  const sx = absCos > 1e-4 ? leafW / g.pageW : 0

  ctx.scale(sx, 1);
  ctx.translate(-srcRect.x, 0);

  if (sx > 1e-4) drawPage(ctx, srcRect, sourceSide, sourceSpread, state.photos);

  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(leafX, srcRect.y, leafW, srcRect.h);
  ctx.clip();

  const lift = 0.36 * sinT;
  const sgrad = onRight ? ctx.createLinearGradient(leafX, 0, leafX + leafW, 0) : ctx.createLinearGradient(leafX + leafW, 0, leafX, 0);

  sgrad.addColorStop(0, `rgba(0,0,0,${lift * 0.55})`);
  sgrad.addColorStop(0.5, `rgba(0,0,0,${lift * 0.18})`);
  sgrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = sgrad;
  ctx.fillRect(leafX, srcRect.y, leafW, srcRect.h);
  ctx.restore();

  const underSide: 'left' | 'right' = onRight ? 'right' : 'left';
  const underRect = underSide === 'right' ? { x: g.rightPageX, y: g.pageY, w: g.pageW, h: g.pageH } : { x: g.leftPageX,  y: g.pageY, w: g.pageW, h: g.pageH };
  const freeEdgeX = onRight ? leafX + leafW : leafX;
  const castDir = onRight ? 1 : -1;
  const castLen = (g.pageW - leafW) * 0.6 + 12;
  const castAlpha = 0.22 * sinT;

  ctx.save();
  ctx.beginPath();
  ctx.rect(underRect.x, underRect.y, underRect.w, underRect.h);
  ctx.clip();

  const ugrad = ctx.createLinearGradient(freeEdgeX, 0, freeEdgeX + castDir * castLen, 0);

  ugrad.addColorStop(0, `rgba(0,0,0,${castAlpha})`);
  ugrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = ugrad;
  ctx.fillRect(underRect.x, underRect.y, underRect.w, underRect.h);
  ctx.restore();
}
