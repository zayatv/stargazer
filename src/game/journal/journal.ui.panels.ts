import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';

export const JOURNAL_BUTTON_LAYER = 100;
export const JOURNAL_BACKDROP_LAYER = 1200;
export const JOURNAL_BOOK_FRAME_LAYER = 1210;
export const JOURNAL_PAGE_LAYER = 1220;
export const JOURNAL_LEAF_LAYER = 1230;
export const JOURNAL_EDGE_LAYER = 1240;
export const JOURNAL_HUD_LAYER = 1250;
export const JOURNAL_NOTE_LAYER = 1280;

const OVERLAY_NAME = 'journal-overlay-root';

export function findJournalOverlay(world: GameWorld): LayoutNode | null {
  for (const child of world.layout.root.children) {
    if (child.debugName === OVERLAY_NAME) return child;
  }

  return null;
}

export function getOrCreateJournalOverlay(world: GameWorld): LayoutNode {
  const existing = findJournalOverlay(world);

  if (existing) return existing;

  const overlay = createNode(world.layout, OVERLAY_NAME);

  configureNode(world.layout, overlay, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
  });

  appendChild(world.layout, world.layout.root, overlay);

  return overlay;
}

export function disposeJournalOverlay(world: GameWorld): void {
  const overlay = findJournalOverlay(world);

  if (overlay) destroyGUINode(world, overlay);
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0 || h <= 0) return;

  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }

  r = Math.min(r, w / 2, h / 2);

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
