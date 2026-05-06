import type { LayoutNode } from '../layout/layout.types.ts';
import type { GameWorld } from '../types.ts';

export const InteractionState = {
  Idle: 0,
  Hovered: 1,
  Pressed: 2,
  Disabled: 3,
} as const;
export type InteractionState = (typeof InteractionState)[keyof typeof InteractionState];

export interface NodeInteraction {
  state: InteractionState;
  enabled: boolean;
  isEnabled?: () => boolean;
  clickSoundKey?: string;
  onTap?: (node: LayoutNode, world: GameWorld) => void;
  onPointerDown?: (node: LayoutNode, world: GameWorld) => void;
  onPointerUp?: (node: LayoutNode, world: GameWorld) => void;
  onHoverEnter?: (node: LayoutNode, world: GameWorld) => void;
  onHoverExit?: (node: LayoutNode, world: GameWorld) => void;
  onDrag?: (node: LayoutNode, dx: number, dy: number, world: GameWorld) => void;
}

export type NodeInteractionConfig = Partial<Omit<NodeInteraction, 'state'>>;

export interface UIState {
  _interactions: Map<number, NodeInteraction>;
  _nodeMap: Map<number, LayoutNode>;
  _hoveredId: number;
  _pressedId: number;
  _pressedOnId: number;
}
