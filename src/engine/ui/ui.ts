import type { UIState, NodeInteraction, NodeInteractionConfig } from './ui.types.ts';
import { InteractionState } from './ui.types.ts';
import type { LayoutNode } from '../layout/layout.types.ts';
import type { GameWorld } from '../types.ts';
import { playSound } from '../audio/audio.ts';

export function createUIState(): UIState {
  return {
    _interactions: new Map(),
    _nodeMap: new Map(),
    _hoveredId: -1,
    _pressedId: -1,
    _pressedOnId: -1,
  };
}

export function registerInteraction(state: UIState, node: LayoutNode, config: NodeInteractionConfig): void {
  const initialEnabled = config.isEnabled ? config.isEnabled() : config.enabled ?? true;
  const interaction: NodeInteraction = {
    state: initialEnabled ? InteractionState.Idle : InteractionState.Disabled,
    enabled: initialEnabled,
    isEnabled: config.isEnabled,
    clickSoundKey: config.clickSoundKey,
    onTap: config.onTap,
    onPointerDown: config.onPointerDown,
    onPointerUp: config.onPointerUp,
    onHoverEnter: config.onHoverEnter,
    onHoverExit: config.onHoverExit,
    onDrag: config.onDrag,
  };

  state._interactions.set(node.id, interaction);
  state._nodeMap.set(node.id, node);
}

export function unregisterInteraction(state: UIState, node: LayoutNode): void {
  state._interactions.delete(node.id);
  state._nodeMap.delete(node.id);

  if (state._hoveredId === node.id) state._hoveredId = -1;
  if (state._pressedId === node.id) state._pressedId = -1;
  if (state._pressedOnId === node.id) state._pressedOnId = -1;
}

export function setInteractionEnabled(state: UIState, node: LayoutNode, enabled: boolean): void {
  const inter = state._interactions.get(node.id);

  if (!inter) return;

  inter.enabled = enabled;

  if (!enabled) {
    inter.state = InteractionState.Disabled;

    if (state._hoveredId === node.id) state._hoveredId = -1;
    if (state._pressedId === node.id) state._pressedId = -1;
    if (state._pressedOnId === node.id) state._pressedOnId = -1;
  } else if (inter.state === InteractionState.Disabled) {
    inter.state = InteractionState.Idle;
  }
}

export function getInteractionState(state: UIState, node: LayoutNode): InteractionState {
  const inter = state._interactions.get(node.id);

  return inter ? inter.state : InteractionState.Idle;
}

function hitTest(node: LayoutNode, x: number, y: number, interactions: Map<number, NodeInteraction>): LayoutNode | null {
  if (!node.visible) return null;

  for (let i = node.children.length - 1; i >= 0; i--) {
    const result = hitTest(node.children[i], x, y, interactions);

    if (result) return result;
  }

  const inter = interactions.get(node.id);

  if (!inter || !inter.enabled) return null;

  const c = node.computed;

  if (x >= c.absX && x < c.absX + c.width && y >= c.absY && y < c.absY + c.height) {
    return node;
  }

  return null;
}

export function uiSystem(world: GameWorld): GameWorld {
  const ui = world.ui;
  const pointer = world.input.pointer;
  const gesture = world.input.gesture;
  const interactions = ui._interactions;

  if (interactions.size === 0) return world;

  for (const [id, inter] of interactions) {
    if (!inter.isEnabled) continue;
    const want = inter.isEnabled();
    if (want !== inter.enabled) {
      const node = ui._nodeMap.get(id);
      if (node) setInteractionEnabled(ui, node, want);
    }
  }

  const hit = hitTest(world.layout.root, pointer.x, pointer.y, interactions);
  const hitId = hit ? hit.id : -1;

  if (hitId !== ui._hoveredId) {

    if (ui._hoveredId !== -1) {
      const prevInter = interactions.get(ui._hoveredId);
      const prevNode = ui._nodeMap.get(ui._hoveredId);

      if (prevInter && prevNode) {
        if (prevInter.state === InteractionState.Hovered) {
          prevInter.state = InteractionState.Idle;
        }

        prevInter.onHoverExit?.(prevNode, world);
      }
    }

    if (hitId !== -1) {
      const newInter = interactions.get(hitId)!;

      if (newInter.state === InteractionState.Idle) {
        newInter.state = InteractionState.Hovered;
      }

      newInter.onHoverEnter?.(hit!, world);
    }

    ui._hoveredId = hitId;
  }

  if (pointer.pressed && hitId !== -1) {
    const inter = interactions.get(hitId)!;

    inter.state = InteractionState.Pressed;
    inter.onPointerDown?.(hit!, world);
    ui._pressedId = hitId;
    ui._pressedOnId = hitId;
  }

  if (pointer.released && ui._pressedId !== -1) {
    const pressedInter = interactions.get(ui._pressedId);
    const pressedNode = ui._nodeMap.get(ui._pressedId);

    if (pressedInter && pressedNode) {
      if (ui._pressedId === hitId) {
        pressedInter.state = InteractionState.Hovered;
      } else {
        pressedInter.state = InteractionState.Idle;
      }

      pressedInter.onPointerUp?.(pressedNode, world);

      if (gesture.tapped && ui._pressedOnId === hitId && hitId !== -1) {
        if (pressedInter.clickSoundKey) playSound(world.audio, pressedInter.clickSoundKey);
        pressedInter.onTap?.(pressedNode, world);
      }
    }

    ui._pressedId = -1;
    ui._pressedOnId = -1;
  }

  if (gesture.dragging && ui._pressedId !== -1) {
    const dragInter = interactions.get(ui._pressedId);
    const dragNode = ui._nodeMap.get(ui._pressedId);

    if (dragInter?.onDrag && dragNode) {
      dragInter.onDrag(dragNode, gesture.dragDX, gesture.dragDY, world);
    }
  }

  return world;
}
