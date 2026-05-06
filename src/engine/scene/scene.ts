import type { SceneDef, SceneTransition, SceneManagerState } from './scene.types.ts';
import type { GameWorld } from '../types.ts';
import { submit } from '../renderer/renderer.ts';

export function createSceneManager(): SceneManagerState {
  return {
    registry: new Map(),
    active: null,
    additive: [],
    _disposers: new Map(),
    _transition: null,
  };
}

export function registerScene(world: GameWorld, scene: SceneDef): void {
  world.scenes.registry.set(scene.name, scene);
}

export function loadScene(world: GameWorld, name: string, transition?: SceneTransition): void {
  const sm = world.scenes;
  const sceneDef = sm.registry.get(name);

  if (!sceneDef) {
    console.warn(`Scene "${name}" not found in registry`);

    return;
  }

  if (transition) {
    sm._transition = {
      from: sm.active,
      to: name,
      effect: transition,
      elapsed: 0,
    };
  } else {
    if (sm.active !== null) {
      exitScene(world, sm.active);
    }

    enterScene(world, name);

    sm.active = name;
  }
}

export function loadAdditiveScene(world: GameWorld, name: string): void {
  const sm = world.scenes;
  const sceneDef = sm.registry.get(name);

  if (!sceneDef) {
    console.warn(`Additive scene "${name}" not found in registry`);

    return;
  }

  if (sm.additive.includes(name)) return;

  enterScene(world, name);

  sm.additive.push(name);
}

export function unloadAdditiveScene(world: GameWorld, name: string): void {
  const sm = world.scenes;
  const idx = sm.additive.indexOf(name);

  if (idx === -1) return;

  exitScene(world, name);

  sm.additive.splice(idx, 1);
}

export function sceneSystem(world: GameWorld): GameWorld {
  const sm = world.scenes;

  if (sm._transition !== null) {
    const tr = sm._transition;

    tr.elapsed += world.time.unscaledDelta;

    const progress = Math.min(tr.elapsed / tr.effect.duration, 1);

    if (progress >= 0.5 && tr.from !== null) {
      exitScene(world, tr.from);

      tr.from = null;

      enterScene(world, tr.to);

      sm.active = tr.to;
    }

    if (sm.active !== null) {
      const sceneDef = sm.registry.get(sm.active);

      sceneDef?.onUpdate?.(world);
    }

    submit(world, 9999, 9999, (ctx) => tr.effect.render(ctx, progress));

    if (progress >= 1) {
      sm._transition = null;
    }

    return world;
  }

  if (sm.active !== null) {
    const sceneDef = sm.registry.get(sm.active);

    if (sceneDef?.onUpdate) {
      sceneDef.onUpdate(world);
    }
  }

  for (let i = 0; i < sm.additive.length; i++) {
    const sceneDef = sm.registry.get(sm.additive[i]);

    if (sceneDef?.onUpdate) {
      sceneDef.onUpdate(world);
    }
  }

  return world;
}

function enterScene(world: GameWorld, name: string): void {
  const sceneDef = world.scenes.registry.get(name);

  if (!sceneDef) return;

  const disposer = sceneDef.onEnter(world);

  if (typeof disposer === 'function') {
    world.scenes._disposers.set(name, disposer);
  }
}

function exitScene(world: GameWorld, name: string): void {
  const sm = world.scenes;
  const disposer = sm._disposers.get(name);

  if (disposer) {
    disposer();

    sm._disposers.delete(name);
  }

  const sceneDef = sm.registry.get(name);

  if (sceneDef) {
    sceneDef.onExit(world);
  }
}
