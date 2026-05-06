import { query } from 'bitecs';
import type { GameWorld } from '../../types.ts';
import { Position, Velocity } from '../components.ts';
import { movementTerms } from '../queries.ts';

export function movementSystem(world: GameWorld): GameWorld {
  const dt = world.time.delta;

  if (dt === 0) return world;

  const entities = query(world, movementTerms);

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];

    Position.x[eid] += Velocity.x[eid] * dt;
    Position.y[eid] += Velocity.y[eid] * dt;
  }

  return world;
}
