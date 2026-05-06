import type { SceneDef, SceneTransition } from '../../engine/scene/scene.types.ts';
import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, removeChild, configureNode,
} from '../../engine/layout/index.ts';
import { SizeMode, Direction, Justify, Align, LayoutKind } from '../../engine/layout/layout.types.ts';
import { createEmitter, destroyEmitter, range, fixedColor, linear } from '../../engine/particles/index.ts';
import {
  spawnActiveEntity, despawnEntity, attachTrail,
  Position, Velocity, RenderLayer,
} from '../../engine/ecs/index.ts';
import { setPosition, setZoom } from '../../engine/camera/index.ts';
import { loadScene, loadAdditiveScene, unloadAdditiveScene } from '../../engine/scene/index.ts';
import { registerInteraction, unregisterInteraction, createUIButton } from '../../engine/ui/index.ts';
import { playSound } from '../../engine/audio/index.ts';
import { isJournalActive } from '../journal/index.ts';
import { getCompletedNightCount, startNight } from '../night/index.ts';
import { getInteractionState } from '../../engine/ui/index.ts';
import { InteractionState } from '../../engine/ui/ui.types.ts';
import { resetAllData } from '../reset.ts';
import {THEME} from "../photo";
import {roundRect} from "../photo/photo.ui.panels.ts";
import {buildFullscreenButton, type FullscreenButtonHandle} from "../ui/fullscreen.button.ts";

function fadeTransition(duration = 0.7, color = '#050712'): SceneTransition {
  return {
    duration,
    render: (ctx, progress) => {
      const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
      const canvas = ctx.canvas;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalAlpha = 1;
    },
  };
}

let _shootingStars: number[] | null = null;
let _spawnTimer = 0;
let _nextSpawnTime = 2;
let _spawnFn: ((world: GameWorld) => void) | null = null;
let _savedCamera: { minZoom: number; maxZoom: number } | null = null;
let _fullscreenButton: FullscreenButtonHandle | null = null;

export const verandaScene: SceneDef = {
  name: 'Veranda',

  onEnter(world: GameWorld) {
    const root = world.layout;
    const cam = world.camera;
    const nodes: LayoutNode[] = [];

    _savedCamera = { minZoom: cam.minZoom, maxZoom: cam.maxZoom };
    setPosition(cam, 0, 0, true);
    setZoom(cam, 1, true);
    cam.targetRotation = 0;
    cam.rotation = 0;
    cam.minZoom = 1;
    cam.maxZoom = 1;

    const container = createNode(root, 'veranda-container');

    configureNode(root, container, {
      widthMode: SizeMode.Fill,
      heightMode: SizeMode.Fill,
      direction: Direction.Column,
      justify: Justify.Center,
      alignItems: Align.Center,
      gap: 24,
    });

    appendChild(root, root.root, container);

    nodes.push(container);

    const completedNights = getCompletedNightCount();
    const upcomingNightNumber = completedNights + 1;

    registerInteraction(world.ui, container, {
      onTap: (_node, w) => {
        if (w.scenes._transition !== null) return;
        if (isJournalActive()) return;

        startNight();
        playSound(w.audio, 'scene-transition');
        loadScene(w, 'NightSky', fadeTransition());
      },
    });

    const title = createNode(root, 'title');

    configureNode(root, title, {
      widthMode: SizeMode.FitContent,
      heightMode: SizeMode.FitContent,
      measure: (ctx) => {
        ctx.font = '48px serif';

        const m = ctx.measureText('Stargazer');

        return { width: m.width, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
      },
      onRender: (_ctx, node) => {
        _ctx.fillStyle = '#ffe4a1';
        _ctx.font = '48px serif';
        _ctx.textBaseline = 'top';
        _ctx.fillText('Stargazer', node.computed.absX, node.computed.absY);
      },
    });

    appendChild(root, container, title);

    nodes.push(title);

    const subtitleText = `Tap the sky to begin Night ${upcomingNightNumber}`;
    const subtitle = createNode(root, 'subtitle');

    configureNode(root, subtitle, {
      widthMode: SizeMode.FitContent,
      heightMode: SizeMode.FitContent,
      measure: (ctx) => {
        ctx.font = '18px sans-serif';

        const m = ctx.measureText(subtitleText);

        return { width: m.width, height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
      },
      onRender: (_ctx, node) => {
        _ctx.fillStyle = '#c4d4ff';
        _ctx.font = '18px sans-serif';
        _ctx.textBaseline = 'top';
        _ctx.fillText(subtitleText, node.computed.absX, node.computed.absY);
      },
    });

    appendChild(root, container, subtitle);

    nodes.push(subtitle);

    const resetLabel = 'Reset data';
    let resetBusy = false;

    const resetHandle = createUIButton(world, {
      parent: root.root,
      id: 'reset-button',
      width: 130,
      height: 32,
      layoutKind: LayoutKind.Absolute,
      absRight: 32,
      absTop: 32,
      draw: (ctx, node, _w) => {
        const c = node.computed;
        const cx = c.absX;
        const cy = c.absY;
        const interaction = getInteractionState(world.ui, node);

        drawResetButton(ctx, cx, cy, c.width, c.height, 8, interaction === InteractionState.Hovered);

        let alpha = 0.45;
        if (interaction === InteractionState.Pressed) alpha = 0.95;
        else if (interaction === InteractionState.Hovered) alpha = 0.8;
        if (resetBusy) alpha = 0.3;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#7d8db5';
        ctx.font = '12px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';

        const textWidth = ctx.measureText(resetLabel).width;

        ctx.fillText(resetLabel, c.absX + c.width / 2 + textWidth / 2, c.absY + c.height * 0.5);
        ctx.restore();
      },
      onTap: () => {
        if (resetBusy) return;

        const ok = window.confirm('Reset all data?\n\nThis permanently deletes every photo, every saved night, and all customization unlocks. This cannot be undone.',);

        if (!ok) return;

        resetBusy = true;

        void resetAllData().finally(() => {
          window.location.reload();
        });
      },
    });
    const reset = resetHandle.node;

    nodes.push(reset);

    _fullscreenButton = buildFullscreenButton(world, root.root, { layer: 100 });

    nodes.push(_fullscreenButton.node);

    const shootingStars: number[] = [];

    _shootingStars = shootingStars;
    _spawnTimer = 0;
    _nextSpawnTime = 1 + Math.random() * 2;

    _spawnFn = spawnShootingStar;

    function spawnShootingStar(w: GameWorld): void {
      const halfW = w.camera._halfW;
      const halfH = w.camera._halfH;

      const startX = (Math.random() - 0.5) * halfW * 1.2;
      const startY = -halfH * 1.05;

      const angle = Math.PI * 0.6 + Math.random() * 0.3;
      const speed = 250 + Math.random() * 200;

      const eid = spawnActiveEntity(w, Position, Velocity, RenderLayer);

      Position.x[eid] = startX;
      Position.y[eid] = startY;
      Velocity.x[eid] = Math.cos(angle) * speed;
      Velocity.y[eid] = Math.sin(angle) * speed;
      RenderLayer.layer[eid] = 1;
      RenderLayer.order[eid] = 0;
      RenderLayer.worldSpace[eid] = 1;

      attachTrail(w, eid, {
        lifetime: 0.5,
        widthStart: 3,
        widthEnd: 0,
        color: '#ffe4a1',
        alphaStart: 0.9,
        alphaEnd: 0,
        smooth: true,
        smoothSegments: 3,
        blendMode: 'lighter',
        minDistance: 4,
      });

      shootingStars.push(eid);
    }

    loadAdditiveScene(world, 'Journal');

    const emitter = createEmitter(world, {
      maxParticles: 200,
      rateOverTime: 40,
      startLifetime: range(1, 2.5),
      startSpeed: range(15, 40),
      startSize: range(2, 5),
      startColor: fixedColor(255, 220, 130),
      directionAngle: range(-Math.PI * 0.75, -Math.PI * 0.25),
      gravityModifier: -0.05,
      sizeOverLifetime: linear(1, 0),
      colorOverLifetime: [
        { t: 0, r: 255, g: 220, b: 130, a: 0.8 },
        { t: 0.6, r: 200, g: 160, b: 80, a: 0.5 },
        { t: 1, r: 100, g: 80, b: 40, a: 0 },
      ],
      blendMode: 'lighter',
      worldSpace: true,
      layer: 0,
      order: -1,
    }, 0, world.canvas.clientHeight * 0.15);

    return () => {
      unregisterInteraction(world.ui, container);
      unregisterInteraction(world.ui, reset);

      if (_fullscreenButton) {
        _fullscreenButton.destroy(world);

        _fullscreenButton = null;
      }

      destroyEmitter(world, emitter);

      for (const eid of shootingStars) {
        despawnEntity(world, eid);
      }

      _shootingStars = null;
      _spawnFn = null;

      unloadAdditiveScene(world, 'Journal');

      if (_savedCamera) {
        cam.minZoom = _savedCamera.minZoom;
        cam.maxZoom = _savedCamera.maxZoom;

        _savedCamera = null;
      }

      for (const node of nodes) {
        removeChild(root, node);
      }
    };
  },

  onUpdate(world: GameWorld): GameWorld {
    const stars = _shootingStars;

    if (!stars) return world;

    const dt = world.time.delta;
    const halfW = world.camera._halfW;
    const halfH = world.camera._halfH;

    _spawnTimer += dt;

    if (_spawnTimer >= _nextSpawnTime) {
      _spawnTimer = 0;
      _nextSpawnTime = 1.5 + Math.random() * 2;

      _spawnFn?.(world);
    }

    const margin = 100;

    for (let i = stars.length - 1; i >= 0; i--) {
      const eid = stars[i];
      const px = Position.x[eid];
      const py = Position.y[eid];

      if (px < -halfW - margin || px > halfW + margin || py < -halfH - margin || py > halfH + margin) {
        despawnEntity(world, eid);

        stars.splice(i, 1);
      }
    }

    return world;
  },

  onExit() {},
};

export function drawResetButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, highlighted: boolean): void {
  ctx.save();
  ctx.shadowColor = THEME.shadow;
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = THEME.panel;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = highlighted ? THEME.panelStrokeHi : THEME.panelStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
}
