import type { GameWorld } from '../../engine/types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, LayoutKind,
} from '../../engine/layout/index.ts';
import type { PhotoModeState } from './photo.types.ts';
import { getOrCreateOverlayContainer, SHUTTER_LAYER } from './photo.ui.panels.ts';

export function buildShutterCurtains(world: GameWorld, state: PhotoModeState): void {
  const overlay = getOrCreateOverlayContainer(world);
  const iris = createNode(world.layout, 'photo-shutter-iris');

  configureNode(world.layout, iris, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: SHUTTER_LAYER,
    order: 0,
    onRender: (ctx, n) => {
      const anim = state.shutterAnim;

      if (!anim) return;

      const cover = anim.coverProgress;

      if (cover <= 0.001) return;

      const c = n.computed;
      const W = c.width;
      const H = c.height;
      const cx = c.absX + W * 0.5;
      const cy = c.absY + H * 0.5;

      const maxR = Math.sqrt(W * W + H * H) * 0.5 + 6;
      const holeR = Math.max(0, maxR * (1 - cover));

      ctx.save();
      ctx.fillStyle = '#04050b';
      ctx.beginPath();
      ctx.rect(c.absX, c.absY, W, H);
      ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
      ctx.fill('evenodd');

      if (holeR > 0.5) {
        const ringW = Math.max(0.6, Math.min(2.5, holeR * 0.05));
        const ringAlpha = Math.min(0.5, 0.18 + cover * 0.4);

        ctx.lineWidth = ringW;
        ctx.strokeStyle = `rgba(255,210,140,${ringAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
        ctx.stroke();

        const innerAlpha = Math.min(0.3, 0.08 + cover * 0.2);

        ctx.lineWidth = ringW * 0.5;
        ctx.strokeStyle = `rgba(255,255,255,${innerAlpha})`;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(0, holeR - ringW * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, iris);

  state.uiNodes.push(iris);
}
