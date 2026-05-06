import type { GUIState } from './gui.types.ts';
import type { LayoutNode } from '../layout/layout.types.ts';
import type { GameWorld } from '../types.ts';
import { removeChild } from '../layout/layout.tree.ts';
import { unregisterInteraction } from '../ui/ui.ts';
import { Group } from '@tweenjs/tween.js';

export function createGUIState(): GUIState {
  return {
    _tweenGroup: new Group(),
  };
}

export function destroyGUINode(world: GameWorld, node: LayoutNode): void {
  const children = node.children.slice();

  for (let i = 0; i < children.length; i++) {
    destroyGUINode(world, children[i]);
  }

  unregisterInteraction(world.ui, node);
  removeChild(world.layout, node);
}
