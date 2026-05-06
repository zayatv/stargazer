import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { registerInteraction } from '../../engine/ui/index.ts';
import { THEME } from '../photo/photo.theme.ts';
import type { InspectState, InspectRect } from './inspect.types.ts';

const OVERLAY_NAME = 'inspect-overlay-root';
export const INSPECT_BACKDROP_LAYER = 1800;
export const INSPECT_TARGET_LAYER = 1810;
export const INSPECT_HUD_LAYER = 1820;

export interface InspectOverlayHandle {
  nodes: LayoutNode[];
  surface: LayoutNode;
}

export function findInspectOverlay(world: GameWorld): LayoutNode | null {
  for (const child of world.layout.root.children) {
    if (child.debugName === OVERLAY_NAME) return child;
  }

  return null;
}

export function getOrCreateInspectOverlay(world: GameWorld): LayoutNode {
  const existing = findInspectOverlay(world);

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

export function disposeInspectOverlay(world: GameWorld): void {
  const overlay = findInspectOverlay(world);

  if (overlay) destroyGUINode(world, overlay);
}

export function targetRectFor(world: GameWorld, state: InspectState): InspectRect {
  const W = world.canvas.clientWidth;
  const H = world.canvas.clientHeight;
  const aspect = state.target.aspect > 0 ? state.target.aspect : 1;
  const maxW = W * 0.72;
  const maxH = H * 0.78;

  let w = maxW;
  let h = w / aspect;

  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }

  const x = (W - w) * 0.5;
  const y = (H - h) * 0.5;

  return { x, y, w, h };
}

export function buildInspectOverlay(world: GameWorld, state: InspectState, onClose: () => void): InspectOverlayHandle {
  const overlay = getOrCreateInspectOverlay(world);
  const nodes: LayoutNode[] = [];
  const backdrop = createNode(world.layout, 'inspect-backdrop');

  configureNode(world.layout, backdrop, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: INSPECT_BACKDROP_LAYER,
    order: 0,
    onRender: (ctx, _n) => {
      const W = world.canvas.clientWidth;
      const H = world.canvas.clientHeight;
      const a = 0.85 * Math.max(0, Math.min(1, state.entryProgress));
      ctx.fillStyle = `rgba(4,6,16,${a})`;
      ctx.fillRect(0, 0, W, H);
    },
  });

  appendChild(world.layout, overlay, backdrop);

  nodes.push(backdrop);

  const surface = createNode(world.layout, 'inspect-surface');

  configureNode(world.layout, surface, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: INSPECT_TARGET_LAYER,
    order: 0,
    onRender: (ctx, _n) => {
      const ep = Math.max(0, Math.min(1, state.entryProgress));
      if (ep <= 0) return;

      const rect = targetRectFor(world, state);
      const cx = rect.x + rect.w * 0.5;
      const cy = rect.y + rect.h * 0.5;
      const entryScale = 0.96 + 0.04 * ep;

      ctx.save();
      ctx.globalAlpha = ep;
      ctx.translate(cx, cy);
      ctx.scale(entryScale, entryScale);
      ctx.translate(-cx, -cy);
      state.target.draw(ctx, rect);
      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, surface);

  registerInteraction(world.ui, surface, {
    onTap: (_n, w) => {
      const rect = targetRectFor(w, state);
      const px = w.input.pointer.x;
      const py = w.input.pointer.y;
      const insideTarget = px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;

      if (!insideTarget) onClose();
    },
  });

  nodes.push(surface);

  const hint = createNode(world.layout, 'inspect-hint');

  configureNode(world.layout, hint, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: INSPECT_HUD_LAYER,
    order: 1,
    onRender: (ctx, _n) => {
      const ep = Math.max(0, Math.min(1, state.entryProgress));
      if (ep <= 0) return;
      const W = world.canvas.clientWidth;
      const H = world.canvas.clientHeight;
      ctx.save();
      ctx.globalAlpha = ep * 0.7;
      ctx.fillStyle = THEME.accentSoft;
      ctx.font = `italic 13px ${THEME.fontSerif}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('tap outside to close', W * 0.5, H - 28);
      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, hint);

  nodes.push(hint);

  return { nodes, surface };
}
