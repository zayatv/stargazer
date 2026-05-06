import type { LayoutNode } from '../../engine/layout/layout.types.ts';

export type InspectMode = 'opening' | 'inspecting' | 'closing';

export interface InspectRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InspectTarget {
  aspect: number;
  draw(ctx: CanvasRenderingContext2D, rect: InspectRect): void;
}

export interface InspectState {
  target: InspectTarget;
  mode: InspectMode;
  entryProgress: number;
  uiNodes: LayoutNode[];
  tweens: Array<{ stop: () => void }>;
}
