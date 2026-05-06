import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import { LayoutKind } from '../../engine/layout/index.ts';
import { createUIButton, getInteractionState } from '../../engine/ui/index.ts';
import { THEME } from '../photo/photo.theme.ts';
import { getOrCreateOverlayContainer, PHOTO_BUTTON_LAYER } from '../photo/photo.ui.panels.ts';
import { drawButtonCircleBackground } from '../ui/button-style.ts';

export interface EndNightButtonHandle {
  node: LayoutNode;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
}

export function buildEndNightButton(world: GameWorld, isEnabled: () => boolean, onTap: () => void): EndNightButtonHandle {
  const overlay = getOrCreateOverlayContainer(world);

  const handle = createUIButton(world, {
    parent: overlay,
    id: 'end-night-button',
    width: 60,
    height: 60,
    layoutKind: LayoutKind.Absolute,
    absRight: 22,
    absTop: 22,
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
      const moonR = c.width * 0.22;
      const offset = moonR * 0.55;

      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx, cy, moonR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx + offset, cy - offset * 0.3, moonR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      ctx.restore();
    },
  });

  return {
    node: handle.node,
    setEnabled: handle.setEnabled,
    setVisible: handle.setVisible,
  };
}
