import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import { LayoutKind } from '../../engine/layout/index.ts';
import { createUIButton, getInteractionState } from '../../engine/ui/index.ts';
import { THEME } from '../photo/photo.theme.ts';
import {
  getOrCreateJournalOverlay,
  roundRectPath,
  JOURNAL_BUTTON_LAYER,
} from './journal.ui.panels.ts';
import { drawButtonCircleBackground } from '../ui/button-style.ts';

export interface JournalButtonHandle {
  node: LayoutNode;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
}

export function buildJournalButton(world: GameWorld, isEnabled: () => boolean, onTap: () => void): JournalButtonHandle {
  const overlay = getOrCreateJournalOverlay(world);

  const handle = createUIButton(world, {
    parent: overlay,
    id: 'journal-button',
    width: 80,
    height: 80,
    layoutKind: LayoutKind.Absolute,
    absRight: 110,
    absBottom: 32,
    layer: JOURNAL_BUTTON_LAYER,
    order: 0,
    isEnabled,
    onTap,
    draw: (ctx, n, _w, enabled) => {
      const c = n.computed;
      const cx = c.absX + c.width * 0.5;
      const cy = c.absY + c.height * 0.5;
      const r = c.width * 0.5;
      const state = getInteractionState(world.ui, n);

      ctx.save();
      ctx.globalAlpha = enabled ? 1 : 0.4;

      drawButtonCircleBackground(ctx, cx, cy, r, state, enabled);

      const stroke = enabled ? THEME.accent : THEME.textMuted;
      const fill = enabled ? 'rgba(232,201,138,0.18)' : 'rgba(180,196,220,0.08)';
      const bookW = c.width * 0.50;
      const bookH = c.width * 0.36;
      const bookX = cx - bookW * 0.5;
      const bookY = cy - bookH * 0.5;

      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      roundRectPath(ctx, bookX, bookY, bookW * 0.5 - 0.5, bookH, 1.5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      roundRectPath(ctx, bookX + bookW * 0.5 + 0.5, bookY, bookW * 0.5 - 0.5, bookH, 1.5);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, bookY);
      ctx.lineTo(cx, bookY + bookH * 0.4);
      ctx.stroke();

      ctx.restore();
    },
  });

  return {
    node: handle.node,
    setEnabled: handle.setEnabled,
    setVisible: handle.setVisible,
  };
}
