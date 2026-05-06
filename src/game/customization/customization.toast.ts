import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { THEME, drawPanel } from '../photo/photo.theme.ts';
import type { ItemDef } from './customization.types.ts';

const TOAST_LAYER = 9500;
const TOAST_W = 320;
const TOAST_H = 56;
const TOAST_GAP = 10;
const SLIDE_MS = 220;
const HOLD_MS = 2500;
const FADE_MS = 220;
const STAGGER_MS = 150;
const MAX_VISIBLE = 3;

interface ToastEntry {
  item: ItemDef;
  enteredAt: number;
}

export interface ToastHandle {
  node: LayoutNode;
  queue: (items: ItemDef[]) => void;
  destroy: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  filter: 'Filter',
  frame: 'Frame',
  lightLeak: 'Light leak',
  feature: 'Feature',
};

export function buildToastLayer(world: GameWorld): ToastHandle {
  const queue: ToastEntry[] = [];
  let nextScheduledAt = 0;

  const node = createNode(world.layout, 'unlock-toast-layer');

  configureNode(world.layout, node, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: TOAST_LAYER,
    order: 0,
    onRender: (ctx, n) => renderToasts(ctx, n, queue),
  });

  appendChild(world.layout, world.layout.root, node);

  return {
    node,
    queue: (items: ItemDef[]) => {
      const now = Date.now();
      const start = Math.max(now, nextScheduledAt);

      for (let i = 0; i < items.length; i++) {
        queue.push({ item: items[i], enteredAt: start + i * STAGGER_MS });
      }

      nextScheduledAt = start + items.length * STAGGER_MS;
    },
    destroy: () => {
      destroyGUINode(world, node);
    },
  };
}

function renderToasts(ctx: CanvasRenderingContext2D, n: LayoutNode, queue: ToastEntry[]): void {
  const now = Date.now();
  const total = SLIDE_MS + HOLD_MS + FADE_MS;

  for (let i = queue.length - 1; i >= 0; i--) {
    if (now - queue[i].enteredAt > total) queue.splice(i, 1);
  }

  if (queue.length === 0) return;

  const c = n.computed;
  const screenW = c.width;
  const screenH = c.height;
  const baseX = (screenW / 2) - (TOAST_W / 2);
  const baseY = screenH - TOAST_H - 24;
  const live = queue.filter(t => now >= t.enteredAt).slice(-MAX_VISIBLE);

  for (let i = 0; i < live.length; i++) {
    const entry = live[i];
    const age = now - entry.enteredAt;

    if (age < 0) continue;

    let alpha: number;
    let slideOffset: number;

    if (age < SLIDE_MS) {
      const p = age / SLIDE_MS;
      const eased = 1 - Math.pow(1 - p, 3);

      alpha = eased;
      slideOffset = (1 - eased) * (TOAST_W + 40);
    } else if (age < SLIDE_MS + HOLD_MS) {
      alpha = 1;
      slideOffset = 0;
    } else {
      const p = (age - SLIDE_MS - HOLD_MS) / FADE_MS;
      const eased = p * p;

      alpha = 1 - eased;
      slideOffset = eased * 12;
    }

    const stackPos = live.length - 1 - i;
    const x = baseX + slideOffset;
    const y = baseY - stackPos * (TOAST_H + TOAST_GAP);

    drawToast(ctx, x, y, alpha, entry.item);
  }
}

function drawToast(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, item: ItemDef): void {
  if (alpha <= 0.001) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  drawPanel(ctx, x, y, TOAST_W, TOAST_H, 12, true);

  const iconCx = x + 28;
  const iconCy = y + TOAST_H * 0.5;

  ctx.fillStyle = THEME.accent;
  ctx.font = `600 18px ${THEME.fontSans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✨', iconCx, iconCy);

  const textX = x + 52;

  ctx.fillStyle = THEME.textPrimary;
  ctx.font = `600 14px ${THEME.fontSans}`;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${item.label} unlocked`, textX, y + 24);

  ctx.fillStyle = THEME.textMuted;
  ctx.font = `500 11px ${THEME.fontSans}`;
  ctx.fillText(CATEGORY_LABELS[item.category] ?? item.category, textX, y + 40);

  ctx.restore();
}
