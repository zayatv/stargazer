import { Tween, Easing } from '@tweenjs/tween.js';
import type { GameWorld } from '../../engine/types.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { loadAdditiveScene, unloadAdditiveScene } from '../../engine/scene/index.ts';
import type { InspectState, InspectTarget } from './inspect.types.ts';
import { buildInspectOverlay, disposeInspectOverlay } from './inspect.ui.ts';

const ENTRY_MS = 240;
const EXIT_MS = 180;

let _state: InspectState | null = null;
let _pendingTarget: InspectTarget | null = null;

export function isInspectActive(): boolean {
  return _state !== null;
}

export function showInspect(world: GameWorld, target: InspectTarget): void {
  if (_state !== null) return;

  _pendingTarget = target;

  loadAdditiveScene(world, 'Inspect');
}

export function hideInspect(world: GameWorld): void {
  const state = _state;

  if (!state) return;
  if (state.mode === 'closing') return;

  state.mode = 'closing';

  const tween = new Tween(state, world.gui._tweenGroup)
    .to({ entryProgress: 0 }, EXIT_MS)
    .easing(Easing.Cubic.In)
    .onComplete(() => {
      unloadAdditiveScene(world, 'Inspect');
    });

  tween.start();
  state.tweens.push(tween);
}

export function initInspect(world: GameWorld): void {
  const target = _pendingTarget;

  _pendingTarget = null;

  if (!target) {
    queueMicrotask(() => unloadAdditiveScene(world, 'Inspect'));

    return;
  }

  const state: InspectState = {
    target,
    mode: 'opening',
    entryProgress: 0,
    uiNodes: [],
    tweens: [],
  };

  _state = state;

  const handle = buildInspectOverlay(world, state, () => hideInspect(world));

  state.uiNodes.push(...handle.nodes);

  const entry = new Tween(state, world.gui._tweenGroup)
    .to({ entryProgress: 1 }, ENTRY_MS)
    .easing(Easing.Cubic.Out)
    .onComplete(() => { state.mode = 'inspecting'; });

  entry.start();
  state.tweens.push(entry);
}

export function disposeInspect(world: GameWorld): void {
  const state = _state;

  if (state) {
    for (const t of state.tweens) {
      try {
        t.stop();
      } catch { }
    }

    for (const node of state.uiNodes) {
      destroyGUINode(world, node);
    }
  }

  disposeInspectOverlay(world);

  _state = null;
}
