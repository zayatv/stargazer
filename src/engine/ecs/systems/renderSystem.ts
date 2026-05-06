import { query, hasComponent } from 'bitecs';
import type { GameWorld } from '../../types.ts';
import { Position, Rotation, Scale, Sprite, RenderLayer } from '../components.ts';
import { renderableTerms } from '../queries.ts';
import { getSpriteKeyName } from '../ecs.ts';
import { getImage } from '../../assets/assets.ts';
import { submit } from '../../renderer/renderer.ts';

export function ecsRenderSystem(world: GameWorld): GameWorld {
  const entities = query(world, renderableTerms);

  if (entities.length === 0) return world;

  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];

    const px = Position.x[eid];
    const py = Position.y[eid];
    const layer = RenderLayer.layer[eid];
    const order = RenderLayer.order[eid];
    const isWorld = RenderLayer.worldSpace[eid] === 1;
    const depth = RenderLayer.depth[eid] || 1;

    const imgIdx = Sprite.imageIndex[eid];
    const sw = Sprite.width[eid];
    const sh = Sprite.height[eid];
    const ax = Sprite.anchorX[eid];
    const ay = Sprite.anchorY[eid];
    const alpha = Sprite.alpha[eid];

    const hasRot = hasComponent(world, eid, Rotation);
    const hasScale = hasComponent(world, eid, Scale);
    const rot = hasRot ? Rotation.angle[eid] : 0;
    const sx = hasScale ? Scale.x[eid] : 1;
    const sy = hasScale ? Scale.y[eid] : 1;

    const key = getSpriteKeyName(imgIdx);

    if (key === null) continue;

    const img = getImage(world.assets, key);

    if (img === null) continue;

    submit(world, layer, order, (ctx) => {
      const drawX = px - sw * ax;
      const drawY = py - sh * ay;

      if (alpha < 1) ctx.globalAlpha = alpha;

      const needsTransform = rot !== 0 || sx !== 1 || sy !== 1;

      if (needsTransform) {
        ctx.translate(px, py);

        if (rot !== 0) ctx.rotate(rot);

        if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);

        ctx.drawImage(img, -sw * ax, -sh * ay, sw, sh);
      } else {
        ctx.drawImage(img, drawX, drawY, sw, sh);
      }
    }, isWorld, depth);
  }

  return world;
}
