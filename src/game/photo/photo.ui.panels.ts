import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import type { PhotoModeState } from './photo.types.ts';
import { THEME } from './photo.theme.ts';

export const PHOTO_BUTTON_LAYER = 100;
export const FRAMING_BACKDROP_LAYER = 200;
export const FRAMING_PREVIEW_LAYER = 210;
export const FRAMING_CHROME_LAYER = 230;
export const FRAMING_HUD_LAYER = 250;
export const SHUTTER_LAYER = 9999;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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

export function findOverlayContainer(world: GameWorld): LayoutNode | null {
  for (const child of world.layout.root.children) {
    if (child.debugName === 'photo-overlay-root') return child;
  }

  return null;
}

export function getOrCreateOverlayContainer(world: GameWorld): LayoutNode {
  const existing = findOverlayContainer(world);

  if (existing) return existing;

  const overlay = createNode(world.layout, 'photo-overlay-root');

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

export function disposePhotoOverlay(world: GameWorld): void {
  const overlay = findOverlayContainer(world);

  if (overlay) destroyGUINode(world, overlay);
}

export function withOptionsClip(state: PhotoModeState, render: (ctx: CanvasRenderingContext2D, node: LayoutNode) => void): (ctx: CanvasRenderingContext2D, node: LayoutNode) => void {
  return (ctx, node) => {
    const r = state.optionsViewportRect;

    if (r) {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
    }

    render(ctx, node);
  };
}

export function syncHtmlInputPositions(state: PhotoModeState): void {
  for (const { el, node } of state.trackedInputBindings) {
    const c = node.computed;
    const visibleAndSized = node.visible && c.width > 0 && c.height > 0 && isAncestorChainVisible(node);

    if (!visibleAndSized) {
      if (el.style.display !== 'none') el.style.display = 'none';

      continue;
    }

    if (el.style.display === 'none') el.style.display = '';

    el.style.left = `${Math.round(c.absX)}px`;
    el.style.top = `${Math.round(c.absY)}px`;
    el.style.width = `${Math.round(c.width)}px`;
    el.style.height = `${Math.round(c.height)}px`;
  }
}

function isAncestorChainVisible(node: { parent: { visible: boolean; parent: unknown } | null }): boolean {
  let cur: { parent: unknown; visible: boolean } | null = node.parent as { parent: unknown; visible: boolean } | null;

  while (cur !== null) {
    if (!cur.visible) return false;

    cur = cur.parent as { parent: unknown; visible: boolean } | null;
  }

  return true;
}

export function createHtmlInput(kind: 'text' | 'textarea', placeholder: string, maxLength: number, initial: string, onChange: (value: string) => void, variant: 'default' | 'borderless' = 'default'): HTMLElement {
  const el = kind === 'textarea' ? document.createElement('textarea') : document.createElement('input');

  if (el instanceof HTMLInputElement) el.type = 'text';

  el.placeholder = placeholder;
  el.maxLength = maxLength;
  el.value = initial;
  el.style.position = 'fixed';
  el.style.left = '0px';
  el.style.top = '0px';
  el.style.width = '0px';
  el.style.height = '0px';
  el.style.boxSizing = 'border-box';
  el.style.outline = 'none';
  el.style.zIndex = '10000';
  el.style.color = THEME.textPrimary;
  el.style.fontSize = '16px';
  el.style.caretColor = THEME.accent;

  if (variant === 'borderless') {
    el.style.background = 'transparent';
    el.style.border = '0';
    el.style.borderBottom = `1px solid ${THEME.panelStroke}`;
    el.style.borderRadius = '0';
    el.style.padding = '6px 2px';
    el.style.fontFamily = THEME.fontSerif;
    el.style.fontSize = '20px';
  } else {
    el.style.background = 'rgba(8,12,22,0.7)';
    el.style.border = `1px solid ${THEME.panelStroke}`;
    el.style.borderRadius = '8px';
    el.style.padding = '8px 10px';
    el.style.fontFamily = THEME.fontSans;
  }

  if (el instanceof HTMLTextAreaElement) {
    el.style.resize = 'none';
    el.style.lineHeight = '1.4';
  }

  el.addEventListener('focus', () => {
    el.style.borderColor = THEME.accent;
  });

  el.addEventListener('blur', () => {
    el.style.borderColor = THEME.panelStroke;
  });

  el.addEventListener('input', () => onChange((el as HTMLInputElement | HTMLTextAreaElement).value));

  return el;
}

export interface PanelDrawOptions {
  highlighted?: boolean;
  radius?: number;
}

export function drawFrostedPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, options: PanelDrawOptions = {}): void {
  const radius = options.radius ?? 14;

  ctx.save();
  ctx.shadowColor = THEME.shadow;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = THEME.panel;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const grad = ctx.createLinearGradient(x, y, x, y + Math.min(h * 0.5, 90));

  grad.addColorStop(0, THEME.panelHi);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, Math.min(h * 0.5, 90));
  ctx.restore();

  ctx.strokeStyle = options.highlighted ? THEME.panelStrokeHi : THEME.panelStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
}