import { Position, Velocity, Sprite, RenderLayer, Active, Trail } from './components.ts';

export const movementTerms = [Position, Velocity];
export const renderableTerms = [Position, Sprite, RenderLayer];
export const activeRenderableTerms = [Position, Sprite, RenderLayer, Active];
export const trailTerms = [Position, Trail];
