export const Direction = { Row: 0, Column: 1 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export const Justify = {
  Start: 0,
  Center: 1,
  End: 2,
  SpaceBetween: 3,
  SpaceAround: 4,
  SpaceEvenly: 5,
} as const;
export type Justify = (typeof Justify)[keyof typeof Justify];

export const Align = {
  Start: 0,
  Center: 1,
  End: 2,
  Stretch: 3,
} as const;
export type Align = (typeof Align)[keyof typeof Align];

export const SizeMode = {
  Fixed: 0,
  Percent: 1,
  FitContent: 2,
  Fill: 3,
} as const;
export type SizeMode = (typeof SizeMode)[keyof typeof SizeMode];

export const LayoutKind = {
  Flex: 0,
  Stack: 1,
  Absolute: 2,
} as const;
export type LayoutKind = (typeof LayoutKind)[keyof typeof LayoutKind];

export interface Constraints {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ComputedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  absX: number;
  absY: number;
}

export interface LayoutNode {
  id: number;
  entityId: number;
  debugName: string;
  parent: LayoutNode | null;
  children: LayoutNode[];
  depth: number;
  layoutKind: LayoutKind;
  direction: Direction;
  justify: Justify;
  alignItems: Align;
  alignSelf: Align | -1;
  gap: number;
  flexGrow: number;
  flexShrink: number;
  widthMode: SizeMode;
  heightMode: SizeMode;
  widthValue: number;
  heightValue: number;
  padding: Edges;
  margin: Edges;
  absLeft: number | null;
  absTop: number | null;
  absRight: number | null;
  absBottom: number | null;
  layer: number | null;
  order: number | null;
  dirty: boolean;
  computed: ComputedLayout;
  onRender: ((ctx: CanvasRenderingContext2D, node: LayoutNode) => void) | null;
  measure: ((ctx: CanvasRenderingContext2D) => { width: number; height: number }) | null;
  visible: boolean;
}

export type Orientation = 'portrait' | 'landscape';

export interface LayoutRoot {
  root: LayoutNode;
  dirty: boolean;
  orientation: Orientation;
  orientationChanged: boolean;
  _nextId: number;
  _ctx: CanvasRenderingContext2D | null;
}
