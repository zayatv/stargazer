import type { GameWorld } from '../types.ts';

export interface SceneDef {
  name: string;
  onEnter: (world: GameWorld) => void | (() => void);
  onUpdate: ((world: GameWorld) => GameWorld) | null;
  onExit: (world: GameWorld) => void;
}

export interface SceneTransition {
  duration: number;
  render: (ctx: CanvasRenderingContext2D, progress: number) => void;
}

export interface SceneManagerState {
  registry: Map<string, SceneDef>;
  active: string | null;
  additive: string[];
  _disposers: Map<string, () => void>;
  _transition: {
    from: string | null;
    to: string;
    effect: SceneTransition;
    elapsed: number;
  } | null;
}
