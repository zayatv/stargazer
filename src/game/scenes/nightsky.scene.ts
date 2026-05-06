import type { SceneDef } from '../../engine/scene/scene.types.ts';
import type { GameWorld } from '../../engine/types.ts';
import {type CameraBounds, rotateAt} from '../../engine/camera/index.ts';
import {
  createEmitter, destroyEmitter, range, fixedColor, EmitterShape,
} from '../../engine/particles/index.ts';
import type { ParticleEmitterState } from '../../engine/particles/index.ts';
import {
  setPosition, setZoom, panBy, zoomAt,
} from '../../engine/camera/index.ts';
import {submit, type Rect} from '../../engine/renderer/index.ts';
import {PerlinNoise} from "../../engine/math/perlin.noise.ts";
import {SeededRandom} from "../../engine/math/seeded.random.ts";
import {
  generateConstellation,
  updateConstellationSystem,
  drawConnectableStars,
  drawSegments,
  drawRubberBand,
  disposeConstellation,
  type ConstellationState, undoLastSegment,
} from '../constellation/index.ts';
import {
  buildPhotoButton,
  enterPhotoMode,
  exitPhotoMode,
  updatePhotoMode,
  disposePhotoOverlay,
  type PhotoSceneContext,
  type PhotoButtonHandle,
} from '../photo/index.ts';
import { isJournalActive } from '../journal/index.ts';
import { isInspectActive } from '../inspect/index.ts';
import { loadScene, loadAdditiveScene, unloadAdditiveScene } from '../../engine/scene/index.ts';
import type { SceneTransition } from '../../engine/scene/scene.types.ts';
import { loadCustomization, buildToastLayer, type ToastHandle } from '../customization/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import {
  getCurrentNight, startNight, endCurrentNight,
  buildEndNightButton, type EndNightButtonHandle,
} from '../night/index.ts';
import {
  registerSound, unregisterSound, playSound, playMusic, stopMusic, VolumeGroup,
} from '../../engine/audio/index.ts';
import {
  Align, appendChild,
  type ButtonHandle, configureNode,
  createNode,
  createUIButton, Direction,
  enqueueImage,
  getInteractionState, Justify,
  LayoutKind, type LayoutNode,
  loadAll, SizeMode
} from "../../engine";
import {drawAssetIconButton} from "../ui/button-style.ts";
import {FRAMING_HUD_LAYER, getOrCreateOverlayContainer} from "../photo/photo.ui.panels.ts";
import {buildFullscreenButton, type FullscreenButtonHandle} from "../ui/fullscreen.button.ts";
import {STAR_CONNECTION_SOUND_KEY, STAR_CONNECTION_SOUND_URL} from "../constellation/constellation.system.ts";

const MUSIC_KEY = 'nightsky-music';
const MUSIC_URL = '/audio/music/music_bg_nightsky_1.mp3';
const MUSIC_GAP_MIN_MS = 5000;
const MUSIC_GAP_MAX_MS = 20000;
const MUSIC_FADE_OUT_MS = 1000;

const AMBIENCE_KEY = 'nightsky-ambience';
const AMBIENCE_URL = '/audio/ambience/ambience_bg_nightsky_1.wav';
const AMBIENCE_FADE_IN_MS = 1500;
const AMBIENCE_FADE_OUT_MS = 1000;

const ERASE_ICON_KEY = 'erase-button-icon';
const ERASE_ICON_URL = '/images/icons/icon_nightsky_erase.png';

const UNDO_ICON_KEY = 'undo-button-icon';
const UNDO_ICON_URL = '/images/icons/icon_nightsky_undo.png';

let _constellationActionButtonsLayout: LayoutNode | null = null;
let _undoButton: ButtonHandle | null = null;
let _eraseButton: ButtonHandle | null = null;
let _fullscreenButton: FullscreenButtonHandle | null = null;

let _musicGapTimer: number | null = null;
let _musicEndHandler: (() => void) | null = null;
let _ambienceId: number | null = null;

interface Nebula {
  x: number;
  y: number;
  radius: number;
  r: number;
  g: number;
  b: number;
  baseAlpha: number;
  pulseAmp: number;
  pulseSpeed: number;
  phase: number;
  driftRadius: number;
  driftSpeed: number;
}

interface RGB {
  r: number;
  g: number;
  b: number
}

interface Star {
  x: number;
  y: number;
  radius: number;
  color: RGB;
}

const SKY_WORLD_SIZE = 3000;
const MAX_ZOOM = 2;

let _haze: ParticleEmitterState | null = null;
let _saved: {
  minZoom: number;
  maxZoom: number;
  bounds: CameraBounds | null;
} | null = null;

const STAR_COLORS: RGB[] = [
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
  { r: 244, g: 248, b: 255 },
  { r: 212, g: 228, b: 255 },
  { r: 184, g: 200, b: 255 },
  { r: 255, g: 244, b: 232 },
  { r: 255, g: 210, b: 161 },
  { r: 230, g: 200, b: 255 },
  { r: 255, g: 204, b: 188 },
];

const STAR_MIN_RADIUS = 2;
const STAR_MAX_RADIUS = 5;
const STAR_INNER_RATIO = 0.55;

const STAR_DEPTH_FAR = 0.45;
const STAR_DEPTH_NEAR = 1.0;
const STAR_GLOW_SCALE_NEAR = 3;
const STAR_GLOW_SCALE_FAR = 8;
const STAR_GLOW_BRIGHTNESS_NEAR = 1.0;
const STAR_GLOW_BRIGHTNESS_FAR = 0.5;
const STAR_SHAPE_T_THRESHOLD = 0.35;

let _skyBounds: Rect = { x: 0, y: 0, w: 0, h: 0 };
let _stars: Star[] = [];
let _constellation: ConstellationState | null = null;
let _photoButton: PhotoButtonHandle | null = null;
let _endNightButton: EndNightButtonHandle | null = null;
let _photoCtx: PhotoSceneContext | null = null;
let _toastHandle: ToastHandle | null = null;

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

const NEBULAE: Nebula[] = [
  { x: -650, y: -500, radius: 680, r: 80, g: 50, b: 140, baseAlpha: 0.12, pulseAmp: 0.04, pulseSpeed: 0.22, phase: 0.3, driftRadius: 22, driftSpeed: 0.08 },
  { x: 700, y: -200, radius: 720, r: 50, g: 85, b: 175, baseAlpha: 0.11, pulseAmp: 0.05, pulseSpeed: 0.28, phase: 1.7, driftRadius: 24, driftSpeed: 0.07 },
  { x: 50, y: 800, radius: 760, r: 140, g: 70, b: 120, baseAlpha: 0.09, pulseAmp: 0.03, pulseSpeed: 0.20, phase: 3.1, driftRadius: 26, driftSpeed: 0.09 },
  { x: -850, y: 600, radius: 520, r: 70, g: 110, b: 190, baseAlpha: 0.10, pulseAmp: 0.04, pulseSpeed: 0.26, phase: 4.8, driftRadius: 18, driftSpeed: 0.06 },
  { x: 900, y: 650, radius: 460, r: 110, g: 70, b: 170, baseAlpha: 0.10, pulseAmp: 0.04, pulseSpeed: 0.24, phase: 0.9, driftRadius: 20, driftSpeed: 0.08 },
];

const NOISE_SCALE = 5;
const STAR_THRESHOLD = 0.45;

export const nightSkyScene: SceneDef = {
  name: 'NightSky',

  onEnter(world: GameWorld) {
    const cam = world.camera;
    const canvasW = world.canvas.clientWidth;
    const canvasH = world.canvas.clientHeight;

    const skyW = SKY_WORLD_SIZE;
    const skyH = SKY_WORLD_SIZE;

    _saved = {
      minZoom: cam.minZoom,
      maxZoom: cam.maxZoom,
      bounds: cam.bounds,
    };

    cam.minZoom = computeFitZoom(0, canvasW, canvasH, skyW, skyH);
    cam.maxZoom = MAX_ZOOM;
    cam.bounds = {
      minX: -skyW * 0.5,
      minY: -skyH * 0.5,
      maxX:  skyW * 0.5,
      maxY:  skyH * 0.5,
    };
    cam.targetRotation = 0;
    cam.rotation = 0;

    setPosition(cam, 0, 0, true);
    setZoom(cam, 1, true);

    registerSound(world.audio, STAR_CONNECTION_SOUND_KEY, {
      src: [STAR_CONNECTION_SOUND_URL],
      loop: false,
      volume: 0.3,
      group: VolumeGroup.SFX,
    })

    registerSound(world.audio, AMBIENCE_KEY, {
      src: [AMBIENCE_URL],
      loop: true,
      volume: 0.1,
      group: VolumeGroup.Ambient,
    });

    const ambEntry = world.audio._registry.get(AMBIENCE_KEY);

    if (ambEntry) {
      const ambTargetVol = ambEntry.howl.volume() as number;

      ambEntry.howl.volume(0);

      _ambienceId = ambEntry.howl.play();

      ambEntry.howl.fade(0, ambTargetVol, AMBIENCE_FADE_IN_MS, _ambienceId);
    }

    registerSound(world.audio, MUSIC_KEY, {
      src: [MUSIC_URL],
      loop: false,
      volume: 1,
      group: VolumeGroup.Music,
    });

    const musicEntry = world.audio._registry.get(MUSIC_KEY);

    if (musicEntry) {
      _musicEndHandler = () => {
        world.audio._currentMusic = null;

        const delayMs = MUSIC_GAP_MIN_MS + Math.random() * (MUSIC_GAP_MAX_MS - MUSIC_GAP_MIN_MS);

        _musicGapTimer = window.setTimeout(() => {
          _musicGapTimer = null;

          playMusic(world.audio, MUSIC_KEY, 0);
        }, delayMs);
      };

      musicEntry.howl.on('end', _musicEndHandler);
    }

    playMusic(world.audio, MUSIC_KEY, 0);

    _haze = createEmitter(world, {
      maxParticles: 90,
      rateOverTime: 10,
      startLifetime: range(5, 10),
      startSpeed: range(3, 9),
      startSize: range(1, 2.5),
      startColor: fixedColor(190, 210, 255),
      directionAngle: range(-Math.PI * 0.55, -Math.PI * 0.45),
      gravityModifier: -0.005,
      sizeOverLifetime: [
        { t: 0,    value: 0 },
        { t: 0.25, value: 1 },
        { t: 0.75, value: 1 },
        { t: 1,    value: 0 },
      ],
      colorOverLifetime: [
        { t: 0,   r: 190, g: 210, b: 255, a: 0 },
        { t: 0.3, r: 210, g: 225, b: 255, a: 0.25 },
        { t: 0.7, r: 180, g: 200, b: 240, a: 0.2 },
        { t: 1,   r: 120, g: 140, b: 200, a: 0 },
      ],
      shape: {
        shape: EmitterShape.Rectangle,
        width: canvasW * 1.1,
        height: canvasH * 1.1,
      },
      blendMode: 'lighter',
      worldSpace: false,
      layer: -50,
      order: 0,
    }, canvasW * 0.5, canvasH * 0.5);

    const night = getCurrentNight() ?? startNight();
    const seed = night.seed;

    generateNightSky(seed, skyW, skyH, STAR_MIN_RADIUS, STAR_MAX_RADIUS, _stars);

    _constellation = generateConstellation(seed, skyW, skyH, _stars);
    _toastHandle = buildToastLayer(world);

    _photoCtx = {
      state: null,
      customizationState: loadCustomization(),
      toastHandle: _toastHandle,
      onPhotoSaved: () => {
        if (_constellation) disposeConstellation(world, _constellation);
      },
    };

    _photoButton = buildPhotoButton(
      world,
      () =>
        (_constellation?.segments.length ?? 0) > 0
        && !isJournalActive()
        && !isInspectActive()
        && _photoCtx?.state == null,
      () => {
        if (_photoCtx) enterPhotoMode(world, _photoCtx);
      },
    );

    _endNightButton = buildEndNightButton(
      world,
      () => !isJournalActive() && !isInspectActive() && _photoCtx?.state == null,
      () => {
        if (world.scenes._transition !== null) return;

        endCurrentNight();
        playSound(world.audio, 'scene-transition');
        loadScene(world, 'Veranda', fadeTransition());
      },
    );

    _fullscreenButton = buildFullscreenButton(world, getOrCreateOverlayContainer(world), { layer: FRAMING_HUD_LAYER });

    loadAdditiveScene(world, 'Journal');

    _skyBounds = { x: -skyW * 0.5, y: -skyH * 0.5, w: skyW, h: skyH };

    enqueueImage(world.assets, ERASE_ICON_KEY, ERASE_ICON_URL);
    enqueueImage(world.assets, UNDO_ICON_KEY, UNDO_ICON_URL);

    void loadAll(world.assets);

    _constellationActionButtonsLayout = createNode(world.layout, 'constellation-actions');

    configureNode(world.layout, _constellationActionButtonsLayout, {
      layoutKind: LayoutKind.Flex,
      direction: Direction.Column,
      alignItems: Align.Center,
      justify: Justify.Center,
      gap: 32,
      widthMode: SizeMode.FitContent,
      heightMode: SizeMode.Fill,
      margin: {
        left: 32,
        right: 0,
        top: 0,
        bottom: 0,
      },
      layer: FRAMING_HUD_LAYER,
      order: 0,
    });

    appendChild(world.layout, world.layout.root, _constellationActionButtonsLayout);

    _undoButton = createUIButton(world, {
      parent: _constellationActionButtonsLayout,
      id: 'undo-button',
      width: 64,
      height: 64,
      layoutKind: LayoutKind.Flex,
      layer: 10,
      order: 0,
      isEnabled: () => true,
      onTap: () => {
        if (_constellation) undoLastSegment(world, _constellation);
      },
      draw: (ctx, n, _w, enabled) => {
        drawAssetIconButton(world, ctx, n, 0.2, enabled, UNDO_ICON_KEY, getInteractionState(world.ui, n));
      },
    });

    _eraseButton = createUIButton(world, {
      parent: _constellationActionButtonsLayout,
      id: 'erase-button',
      width: 64,
      height: 64,
      layoutKind: LayoutKind.Flex,
      layer: 10,
      order: 1,
      isEnabled: () => true,
      onTap: () => {
        if (_constellation) disposeConstellation(world, _constellation);
      },
      draw: (ctx, n, _w, enabled) => {
        drawAssetIconButton(world, ctx, n, 0.2, enabled, ERASE_ICON_KEY, getInteractionState(world.ui, n));
      },
    });

    return () => {
      if (_musicGapTimer !== null) {
        clearTimeout(_musicGapTimer);

        _musicGapTimer = null;
      }

      const exitingEntry = world.audio._registry.get(MUSIC_KEY);

      if (exitingEntry && _musicEndHandler) {
        exitingEntry.howl.off('end', _musicEndHandler);
      }

      _musicEndHandler = null;

      unregisterSound(world.audio, STAR_CONNECTION_SOUND_KEY);

      stopMusic(world.audio, MUSIC_FADE_OUT_MS);
      unregisterSound(world.audio, MUSIC_KEY);

      fadeAndUnload(world, AMBIENCE_KEY, AMBIENCE_FADE_OUT_MS, _ambienceId);

      _ambienceId = null;

      if (_haze) {
        destroyEmitter(world, _haze);

        _haze = null;
      }

      if (_photoCtx && _photoCtx.state) {
        exitPhotoMode(world, _photoCtx);
      }
      _photoCtx = null;

      unloadAdditiveScene(world, 'Journal');

      if (_fullscreenButton) {
        _fullscreenButton.destroy(world);

        _fullscreenButton = null;
      }

      if (_photoButton) {
        destroyGUINode(world, _photoButton.node);

        _photoButton = null;
      }

      if (_endNightButton) {
        destroyGUINode(world, _endNightButton.node);

        _endNightButton = null;
      }

      disposePhotoOverlay(world);

      if (_toastHandle) {
        _toastHandle.destroy();

        _toastHandle = null;
      }

      if (_undoButton) {
        destroyGUINode(world, _undoButton.node);

        _undoButton = null;
      }

      if (_eraseButton) {
        destroyGUINode(world, _eraseButton.node);

        _eraseButton = null;
      }

      if (_constellationActionButtonsLayout) {
        destroyGUINode(world, _constellationActionButtonsLayout);

        _constellationActionButtonsLayout = null;
      }

      if (_constellation) {
        disposeConstellation(world, _constellation);

        _constellation = null;
      }

      if (_saved) {
        cam.minZoom = _saved.minZoom;
        cam.maxZoom = _saved.maxZoom;
        cam.bounds = _saved.bounds;

        _saved = null;
      }

      _stars.length = 0;
    };
  },

  onUpdate(world: GameWorld): GameWorld {
    if (world.scenes._transition !== null) return world;

    const input = world.input;
    const cam = world.camera;
    const sw = world.canvas.clientWidth;
    const sh = world.canvas.clientHeight;
    const ges = input.gesture;

    const photoActive = _photoCtx?.state != null;
    const journalActive = isJournalActive();
    const inspectActive = isInspectActive();
    const sceneFrozen = journalActive || inspectActive;

    if (_photoCtx) updatePhotoMode(world, _photoCtx);
    if (_constellation && !photoActive && !sceneFrozen) updateConstellationSystem(world, _constellation);

    if (_photoButton && _constellation) {
      _photoButton.setEnabled(!photoActive && !sceneFrozen && _constellation.segments.length > 0);
      _photoButton.setVisible(!photoActive && !sceneFrozen);
    }

    if (_endNightButton) {
      _endNightButton.setEnabled(!photoActive && !sceneFrozen);
      _endNightButton.setVisible(!photoActive && !sceneFrozen);
    }

    if (_fullscreenButton) {
      _fullscreenButton.setVisible(!photoActive && !sceneFrozen);
    }

    if (_constellationActionButtonsLayout)
    {
      _constellationActionButtonsLayout.visible = !photoActive && !sceneFrozen && _constellation !== null && _constellation.segments.length > 0;
    }

    if (ges.zoomDelta !== 1 && !sceneFrozen) {
      zoomAt(cam, sw, sh, ges.zoomX, ges.zoomY, ges.zoomDelta);
    }

    if (ges.rotateDelta !== 0 && !sceneFrozen) {
      rotateAt(cam, sw, sh, ges.rotateX, ges.rotateY, ges.rotateDelta)
    }

    const uiPressed = world.ui._pressedId !== -1;

    if (ges.dragging && !_constellation?.drawing.active && !uiPressed && !sceneFrozen) {
      panBy(cam, ges.dragDX, ges.dragDY);
    }

    const fitZoom = worstFitZoom(cam.rotation, cam.targetRotation, sw, sh, SKY_WORLD_SIZE, SKY_WORLD_SIZE);

    if (photoActive) {
      cam.minZoom = fitZoom * 0.35;
    } else {
      cam.minZoom = fitZoom;

      if (cam.zoom < fitZoom) cam.zoom = fitZoom;
      if (cam.targetZoom < fitZoom) cam.targetZoom = fitZoom;
    }

    drawBackground(world);
    drawNebulae(world);
    drawStars(world);

    if (_constellation) {
      const t = world.time.elapsed;

      drawConnectableStars(world, _constellation, t);
      drawSegments(world, _constellation, t);

      if (!photoActive) {
        drawRubberBand(world, _constellation, t);
      }
    }

    return world;
  },

  onExit() {},
};

function computeFitZoom(rotation: number, screenW: number, screenH: number, skyW: number, skyH: number,): number {
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  const aabbW = screenW * c + screenH * s;
  const aabbH = screenW * s + screenH * c;

  return Math.max(aabbW / skyW, aabbH / skyH);
}

function worstFitZoom(r1: number, r2: number, screenW: number, screenH: number, skyW: number, skyH: number,): number {
  const lo = Math.min(r1, r2);
  const hi = Math.max(r1, r2);

  let worst = Math.max(
    computeFitZoom(r1, screenW, screenH, skyW, skyH),
    computeFitZoom(r2, screenW, screenH, skyW, skyH),
  );

  const quart = Math.PI * 0.25;
  const half = Math.PI * 0.5;
  const kStart = Math.ceil((lo - quart) / half);
  const kEnd = Math.floor((hi - quart) / half);

  for (let k = kStart; k <= kEnd; k++) {
    const r = quart + k * half;
    const f = computeFitZoom(r, screenW, screenH, skyW, skyH);

    if (f > worst) worst = f;
  }

  return worst;
}

function generateNightSky(seed: number, width: number, height: number, minRadius: number, maxRadius: number, stars: Star[],) {
  const noiseGen = new PerlinNoise(seed);
  const random = new SeededRandom(seed);

  const ox1 = (seed * 123.456) % 1000;
  const oy1 = (seed * 789.123) % 1000;
  const ox2 = (seed * 456.789) % 1000;
  const oy2 = (seed * 321.987) % 1000;

  stars.length = 0;

  const cellSize = Math.max(1, maxRadius * 2);
  const grid = new Map<number, Star[]>();
  const cellKey = (cx: number, cy: number) => (cx * 73856093) ^ (cy * 19349663);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const n1 = noiseGen.noise2D(x / NOISE_SCALE + ox1, y / NOISE_SCALE + oy1);
      const n2 = noiseGen.noise2D(x / NOISE_SCALE + ox2, y / NOISE_SCALE + oy2);

      if (n1 * n2 <= STAR_THRESHOLD) continue;

      const star: Star = {
        x: x - width * 0.5,
        y: y - height * 0.5,
        radius: random.float(minRadius, maxRadius),
        color: STAR_COLORS[random.int(0, STAR_COLORS.length - 1)],
      };

      const cx = Math.floor(star.x / cellSize);
      const cy = Math.floor(star.y / cellSize);

      if (overlapsNeighbour(star, grid, cellKey, cx, cy)) continue;

      stars.push(star);

      const key = cellKey(cx, cy);
      const cell = grid.get(key);

      if (cell) cell.push(star);
      else grid.set(key, [star]);
    }
  }
}

function overlapsNeighbour(star: Star, grid: Map<number, Star[]>, cellKey: (cx: number, cy: number) => number, cx: number, cy: number,): boolean {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = grid.get(cellKey(cx + dx, cy + dy));

      if (!cell) continue;

      for (const other of cell) {
        const ex = other.x - star.x;
        const ey = other.y - star.y;
        const rsum = star.radius + other.radius;

        if (ex * ex + ey * ey < rsum * rsum) return true;
      }
    }
  }
  return false;
}

function drawBackground(world: GameWorld) {
  const sx = _skyBounds.x;
  const sy = _skyBounds.y;
  const skyW = _skyBounds.w;
  const skyH = _skyBounds.h;

  submit(world, -100, 0, (ctx) => {
    const base = ctx.createLinearGradient(sx, sy, sx, sy + skyH);

    base.addColorStop(0.00, '#04030d');
    base.addColorStop(0.50, '#080717');
    base.addColorStop(1.00, '#0b0a1f');
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, skyW, skyH);

    const cx = sx + skyW * 0.5;
    const cy = sy + skyH * 0.5;
    const vignette = ctx.createRadialGradient(cx, cy, skyW * 0.25, cx, cy, skyW * 0.75);

    vignette.addColorStop(0.0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1.0, 'rgba(0,0,0,0.45)');

    ctx.fillStyle = vignette;

    ctx.fillRect(sx, sy, skyW, skyH);
  }, true, 1, _skyBounds);
}

function drawNebulae(world: GameWorld) {
  const t = world.time.elapsed;

  for (let i = 0; i < NEBULAE.length; i++) {
    const n = NEBULAE[i];
    const alpha = Math.max(0, n.baseAlpha + n.pulseAmp * Math.sin(t * n.pulseSpeed + n.phase));
    const dx = Math.cos(t * n.driftSpeed + n.phase) * n.driftRadius;
    const dy = Math.sin(t * n.driftSpeed * 0.73 + n.phase * 1.3) * n.driftRadius;
    const cx = n.x + dx;
    const cy = n.y + dy;
    const rad = n.radius;

    submit(world, -90, i, (ctx) => {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);

      grad.addColorStop(0.00, `rgba(${n.r},${n.g},${n.b},${alpha})`);
      grad.addColorStop(0.45, `rgba(${n.r},${n.g},${n.b},${alpha * 0.35})`);
      grad.addColorStop(1.00, `rgba(${n.r},${n.g},${n.b},0)`);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      ctx.globalCompositeOperation = 'source-over';
    }, true, 1, {x: cx - rad, y: cy - rad, w: rad * 2, h: rad * 2});
  }
}

function drawStars(world: GameWorld) {
  const radiusSpan = STAR_MAX_RADIUS - STAR_MIN_RADIUS;

  for (let i = 0; i < _stars.length; i++) {
    const s = _stars[i];
    const tSize = radiusSpan > 0 ? Math.min(1, Math.max(0, (s.radius - STAR_MIN_RADIUS) / radiusSpan)) : 1;
    const depth = STAR_DEPTH_FAR + (STAR_DEPTH_NEAR - STAR_DEPTH_FAR) * tSize;
    const glowScale = STAR_GLOW_SCALE_FAR + (STAR_GLOW_SCALE_NEAR - STAR_GLOW_SCALE_FAR) * tSize;
    const brightness = STAR_GLOW_BRIGHTNESS_FAR + (STAR_GLOW_BRIGHTNESS_NEAR - STAR_GLOW_BRIGHTNESS_FAR) * tSize;
    const glow = s.radius * glowScale;
    const twinkle = 0.85 * brightness;
    const drawAsCircle = tSize < STAR_SHAPE_T_THRESHOLD;

    submit(world, 40, 2, (ctx) => {
      const {r, g, b} = s.color;
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, glow);

      grad.addColorStop(0.00, `rgba(${r},${g},${b},${Math.min(1, 0.60 * twinkle)})`);
      grad.addColorStop(0.08, `rgba(${r},${g},${b},${Math.min(1, 0.30 * twinkle)})`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},${Math.min(1, 0.08 * twinkle)})`);
      grad.addColorStop(0.60, `rgba(${r},${g},${b},${Math.min(1, 0.02 * twinkle)})`);
      grad.addColorStop(1.00, `rgba(${r},${g},${b},0)`);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      if (drawAsCircle) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * STAR_INNER_RATIO, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const inner = s.radius * STAR_INNER_RATIO * Math.SQRT1_2;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y - s.radius);
        ctx.lineTo(s.x + inner, s.y - inner);
        ctx.lineTo(s.x + s.radius, s.y);
        ctx.lineTo(s.x + inner, s.y + inner);
        ctx.lineTo(s.x, s.y + s.radius);
        ctx.lineTo(s.x - inner, s.y + inner);
        ctx.lineTo(s.x - s.radius, s.y);
        ctx.lineTo(s.x - inner, s.y - inner);
        ctx.closePath();
        ctx.fill();
      }
    }, true, depth, {x: s.x - glow, y: s.y - glow, w: glow * 2, h: glow * 2});
  }
}

function fadeAndUnload(world: GameWorld, key: string, fadeMs: number, id?: number | null) {
  const entry = world.audio._registry.get(key);

  if (entry) {
    const howl = entry.howl;
    const targetId = id ?? undefined;
    const curVol = howl.volume(targetId) as number;

    world.audio._registry.delete(key);
    howl.fade(curVol, 0, fadeMs, targetId);

    howl.once('fade', () => {
      howl.stop(targetId);
      howl.unload();
    }, targetId);
  } else {
    unregisterSound(world.audio, key);
  }
}
