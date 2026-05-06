import { query } from 'bitecs';
import type { EntityId } from 'bitecs';
import type { GameWorld } from '../../types.ts';
import type { TrailConfig, TrailState } from '../../trail/trail.types.ts';
import { Position, Trail, RenderLayer } from '../components.ts';
import { trailTerms } from '../queries.ts';
import { createTrail, addTrailPoint, updateTrail, submitTrail } from '../../trail/trail.ts';
import { addComponent, removeComponent, _registerTrailCleanup } from '../ecs.ts';

const _trails = new Map<EntityId, TrailState>();

_registerTrailCleanup((eid) => {
  _trails.delete(eid);
});

export function attachTrail(world: GameWorld, eid: EntityId, overrides?: Partial<TrailConfig>): TrailState {
  const trail = createTrail(overrides);
  _trails.set(eid, trail);
  addComponent(world, eid, Trail);
  return trail;
}

export function detachTrail(world: GameWorld, eid: EntityId): void {
  _trails.delete(eid);

  removeComponent(world, eid, Trail);
}

export function getTrail(eid: EntityId): TrailState | null {
  return _trails.get(eid) ?? null;
}

export function trailSystem(world: GameWorld): GameWorld {
  const dt = world.time.delta;
  const entities = query(world, trailTerms);

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];
    const trail = _trails.get(eid);

    if (!trail) continue;

    addTrailPoint(trail, Position.x[eid], Position.y[eid]);
    updateTrail(trail, dt);

    const layer = RenderLayer.layer[eid] ?? 0;
    const order = (RenderLayer.order[eid] ?? 0) - 1;
    const isWorld = (RenderLayer.worldSpace[eid] ?? 0) === 1;
    const depth = RenderLayer.depth[eid] || 1;

    submitTrail(world, trail, layer, order, isWorld, depth);
  }

  return world;
}