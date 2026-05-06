import type { SceneDef } from '../../engine/scene/scene.types.ts';
import type { GameWorld } from '../../engine/types.ts';
import { initJournal, tickJournal, disposeJournal } from './journal.system.ts';

export const journalScene: SceneDef = {
  name: 'Journal',

  onEnter(world: GameWorld) {
    initJournal(world);
  },

  onUpdate(world: GameWorld): GameWorld {
    tickJournal(world);

    return world;
  },

  onExit(world: GameWorld): void {
    disposeJournal(world);
  },
};
