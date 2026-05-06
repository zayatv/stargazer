import type { GameWorld } from '../../engine/types.ts';

export interface CaptureRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function captureViewport(world: GameWorld, vp: CaptureRect): string {
  const dpr = window.devicePixelRatio || 1;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(vp.w * dpr));
  off.height = Math.max(1, Math.round(vp.h * dpr));

  const offCtx = off.getContext('2d');
  if (!offCtx) return '';

  offCtx.drawImage(
    world.canvas,
    vp.x * dpr, vp.y * dpr, vp.w * dpr, vp.h * dpr,
    0, 0, off.width, off.height,
  );

  return off.toDataURL('image/png');
}