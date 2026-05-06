import type { GameWorld } from '../types.ts';
import type { LayoutNode } from '../layout/layout.types.ts';

export type DrawFn = (ctx: CanvasRenderingContext2D) => void;
export type EntityRenderFn = (ctx: CanvasRenderingContext2D, world: GameWorld, eid: number) => void;
export type EntityBoundsFn = (world: GameWorld, eid: number) => Rect | null;

export interface Rect { x: number; y: number; w: number; h: number }

export interface DrawEntry { kind: 0; layer: number; order: number; worldSpace: boolean; depth: number; bounds: Rect | null; draw: DrawFn }
export interface NodeEntry { kind: 1; layer: number; order: number; worldSpace: boolean; depth: number; bounds: Rect | null; node: LayoutNode }
export interface EntityEntry { kind: 2; layer: number; order: number; worldSpace: boolean; depth: number; bounds: Rect | null; eid: number; render: EntityRenderFn }
export type QueueEntry = DrawEntry | NodeEntry | EntityEntry;

export interface EntityRenderer {
  layer: number;
  order: number;
  worldSpace: boolean;
  depth: number;
  render: EntityRenderFn;
  bounds: EntityBoundsFn | null;
}

export interface TextStyle {
  font?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  maxWidth?: number;
}

export interface ShapeStyle {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface LineStyle {
  stroke?: string;
  width?: number;
  cap?: CanvasLineCap;
  join?: CanvasLineJoin;
  dash?: number[];
}

export interface ImageOptions {
  sx?: number;
  sy?: number;
  sw?: number;
  sh?: number;
  width?: number;
  height?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  alpha?: number;
}

export interface RendererState {
  entityRenderers: Map<number, EntityRenderer>;
  _queue: QueueEntry[];
}
