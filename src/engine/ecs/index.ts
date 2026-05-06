export {
  Position, Velocity, Rotation, Scale,
  Sprite, RenderLayer, Active, Trail,
} from './components.ts';

export {
  movementTerms, renderableTerms, activeRenderableTerms, trailTerms,
} from './queries.ts';

export {
  addEntity, removeEntity,
  addComponent, addComponents, removeComponent,
  hasComponent, entityExists,
  spawnEntity, spawnActiveEntity, despawnEntity,
  registerSpriteKey, getSpriteKeyIndex, getSpriteKeyName,
  setSpriteData,
} from './ecs.ts';
export type { EntityId } from './ecs.ts';

export { movementSystem } from './systems/movementSystem.ts';
export { ecsRenderSystem } from './systems/renderSystem.ts';
export { trailSystem, attachTrail, detachTrail, getTrail } from './systems/trailSystem.ts';
