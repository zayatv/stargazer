import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import { LayoutKind } from '../../engine/layout/index.ts';
import { createUIButton, getInteractionState } from '../../engine/ui/index.ts';
import { THEME } from './photo.theme.ts';
import { roundRect, getOrCreateOverlayContainer, PHOTO_BUTTON_LAYER } from './photo.ui.panels.ts';
import { drawButtonCircleBackground } from '../ui/button-style.ts';

export interface PhotoButtonHandle {
  node: LayoutNode;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
}

export function buildPhotoButton(world: GameWorld, isEnabled: () => boolean, onTap: () => void): PhotoButtonHandle {
  const overlay = getOrCreateOverlayContainer(world);

  const handle = createUIButton(world, {
    parent: overlay,
    id: 'photo-button',
    width: 80,
    height: 80,
    layoutKind: LayoutKind.Absolute,
    absRight: 32,
    absBottom: 110,
    layer: PHOTO_BUTTON_LAYER,
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

      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.lineWidth = 1.5;

      const bodyW = c.width * 0.44;
      const bodyH = c.width * 0.32;
      const bodyX = cx - bodyW * 0.5;
      const bodyY = cy - bodyH * 0.4;

      ctx.beginPath();
      roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 2);
      ctx.stroke();

      const humpW = bodyW * 0.36;
      const humpH = c.width * 0.06;

      ctx.beginPath();
      roundRect(ctx, cx - humpW * 0.5, bodyY - humpH + 0.5, humpW, humpH, 1.5);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, bodyY + bodyH * 0.55, c.width * 0.105, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, bodyY + bodyH * 0.55, c.width * 0.05, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    },
  });

  return {
    node: handle.node,
    setEnabled: handle.setEnabled,
    setVisible: handle.setVisible,
  };
}
