import { InteractionState } from '../../engine/ui/ui.types.ts';
import { THEME } from '../photo/photo.theme.ts';
import {type GameWorld, getImage, type LayoutNode} from "../../engine";

export function drawButtonCircleBackground(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  state: InteractionState,
  enabled: boolean,
): void {
  ctx.save();

  let bg: string;

  if (!enabled) bg = 'rgba(20,30,55,0.55)';
  else if (state === InteractionState.Pressed) bg = 'rgba(50,40,28,0.92)';
  else if (state === InteractionState.Hovered) bg = 'rgba(36,30,22,0.88)';
  else bg = 'rgba(20,28,46,0.78)';

  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = enabled ? THEME.accentSoft : THEME.panelStroke;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

export function drawAssetIconButton(
    world: GameWorld,
    ctx: CanvasRenderingContext2D,
    n: LayoutNode,
    iconScale: number,
    enabled: boolean,
    iconKey: string,
    state: InteractionState,
): void {
  const c = n.computed;
  const cx = c.absX + c.width * 0.5;
  const cy = c.absY + c.height * 0.5;
  const r = c.width * 0.5;
  const icon = getImage(world.assets, iconKey);

  ctx.save();

  ctx.globalAlpha = enabled ? 1 : 0.4;

  drawButtonCircleBackground(ctx, cx, cy, r, state, enabled);

  if (icon) {
    const iconWidth = icon.width * iconScale;
    const iconHeight = icon.height * iconScale;
    const iconX = cx - iconWidth * 0.5;
    const iconY = cy - iconHeight * 0.5;

    ctx.drawImage(icon, iconX, iconY, iconWidth, iconHeight);
  }

  ctx.restore();
}
