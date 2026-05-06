import type { SceneDef } from '../../engine/scene/scene.types.ts';
import type { GameWorld } from '../../engine/types.ts';
import { initInspect, disposeInspect } from './inspect.system.ts';

export const inspectScene: SceneDef = {
  name: 'Inspect',

  onEnter(world: GameWorld) {
    initInspect(world);
  },

  onUpdate(world: GameWorld): GameWorld {
    return world;
  },

  onExit(world: GameWorld): void {
    disposeInspect(world);
  },
};
