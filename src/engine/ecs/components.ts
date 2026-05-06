import { soa } from 'bitecs';

export const Position = soa({
  x: [] as number[],
  y: [] as number[],
});

export const Velocity = soa({
  x: [] as number[],
  y: [] as number[],
});

export const Rotation = soa({
  angle: [] as number[],
});

export const Scale = soa({
  x: [] as number[],
  y: [] as number[],
});

export const Sprite = soa({
  imageIndex: [] as number[],
  width: [] as number[],
  height: [] as number[],
  anchorX: [] as number[],
  anchorY: [] as number[],
  alpha: [] as number[],
});

export const RenderLayer = soa({
  layer: [] as number[],
  order: [] as number[],
  worldSpace: [] as number[],
  depth: [] as number[],
});

export const Active = {};

export const Trail = {};
