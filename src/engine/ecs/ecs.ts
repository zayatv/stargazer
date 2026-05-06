import {
  addEntity, removeEntity,
  addComponent, addComponents, removeComponent,
  hasComponent, entityExists,
} from 'bitecs';
import type { EntityId } from 'bitecs';
import type { GameWorld } from '../types.ts';
import { unregisterEntityRenderer } from '../renderer';
import { Sprite, Active, Trail } from './components.ts';

let _trailCleanup: ((eid: EntityId) => void) | null = null;

export function _registerTrailCleanup(fn: (eid: EntityId) => void): void {
  _trailCleanup = fn;
}

export {
  addEntity, removeEntity,
  addComponent, addComponents, removeComponent,
  hasComponent, entityExists,
};

export type { EntityId };

const _keyToIndex = new Map<string, number>();
const _indexToKey: string[] = [];

export function registerSpriteKey(key: string): number {
  const existing = _keyToIndex.get(key);

  if (existing !== undefined) return existing;

  const idx = _indexToKey.length;

  _keyToIndex.set(key, idx);

  _indexToKey.push(key);

  return idx;
}

export function getSpriteKeyIndex(key: string): number {
  return _keyToIndex.get(key) ?? -1;
}

export function getSpriteKeyName(index: number): string | null {
  return _indexToKey[index] ?? null;
}

export function spawnEntity(world: GameWorld, ...components: any[]): EntityId {
  const eid = addEntity(world);

  if (components.length > 0) {
    addComponents(world, eid, ...components);
  }

  return eid;
}

export function spawnActiveEntity(world: GameWorld, ...components: any[]): EntityId {
  const eid = addEntity(world);

  addComponent(world, eid, Active);

  if (components.length > 0) {
    addComponents(world, eid, ...components);
  }

  return eid;
}

export function despawnEntity(world: GameWorld, eid: EntityId): void {
  if (!entityExists(world, eid)) return;

  unregisterEntityRenderer(world, eid);

  if (_trailCleanup && hasComponent(world, eid, Trail)) {
    _trailCleanup(eid);
  }

  removeEntity(world, eid);
}

export function setSpriteData(eid: EntityId, imageKey: string, width: number, height: number, anchorX = 0, anchorY = 0, alpha = 1): void {
  Sprite.imageIndex[eid] = registerSpriteKey(imageKey);
  Sprite.width[eid] = width;
  Sprite.height[eid] = height;
  Sprite.anchorX[eid] = anchorX;
  Sprite.anchorY[eid] = anchorY;
  Sprite.alpha[eid] = alpha;
}
