import type { GameWorld, ParticleEmitterState } from '../engine';
import {
  createEmitter, destroyEmitter, setEmitterPosition, range, fixedColor,
} from '../engine';
import { isPhotoModeActive } from './photo/index.ts';

interface CursorFxEntry {
  emitter: ParticleEmitterState;
  lastX: number;
  lastY: number;
  smoothedSpeed: number;
  active: boolean;
}

const HOVER_KEY = -1;
const _entries = new Map<number, CursorFxEntry>();

let _initialized = false;

const IDLE_RATE = 7;
const MAX_RATE = 55;
const SPEED_FOR_MAX_RATE = 700;
const SPEED_SMOOTH_TAU = 0.12;

const FX_LAYER = 2;
const FX_ORDER = 10;

function createEntry(world: GameWorld, x: number, y: number): CursorFxEntry {
  const emitter = createEmitter(world, {
    maxParticles: 220,
    rateOverTime: IDLE_RATE,
    startLifetime: range(0.9, 1.8),
    startSpeed: range(4, 22),
    startSize: range(0.8, 2.6),
    startColor: fixedColor(225, 235, 255),
    directionAngle: range(0, Math.PI * 2),
    gravityModifier: -0.012,
    sizeOverLifetime: [
      { t: 0,    value: 0 },
      { t: 0.25, value: 1 },
      { t: 1,    value: 0 },
    ],
    colorOverLifetime: [
      { t: 0,    r: 255, g: 255, b: 255, a: 0 },
      { t: 0.18, r: 235, g: 242, b: 255, a: 0.85 },
      { t: 0.55, r: 190, g: 210, b: 255, a: 0.55 },
      { t: 1,    r: 150, g: 160, b: 220, a: 0 },
    ],
    speedOverLifetime: [
      { t: 0, value: 1 },
      { t: 1, value: 0.18 },
    ],
    blendMode: 'lighter',
    worldSpace: false,
    layer: FX_LAYER,
    order: FX_ORDER,
  }, x, y);

  return {
    emitter,
    lastX: x,
    lastY: y,
    smoothedSpeed: 0,
    active: true,
  };
}

export function initCursorFx(_world: GameWorld): void {
  _initialized = true;
}

export function cursorFxSystem(world: GameWorld): GameWorld {
  if (!_initialized) return world;

  const ptr = world.input.pointer;
  const dt = world.time.unscaledDelta;
  const active = world.input._recognizer._activePointers;
  const photoActive = isPhotoModeActive();

  const liveIds: number[] = [];

  if (!photoActive) {
    if (active.size === 0) {
      if (ptr.hovering && ptr.kind !== 'touch') liveIds.push(HOVER_KEY);
    } else {
      for (const id of active.keys()) liveIds.push(id);
    }
  }
  const liveSet = new Set(liveIds);

  for (const id of liveIds) {
    let entry = _entries.get(id);

    const x = id === HOVER_KEY ? ptr.x : active.get(id)!.x;
    const y = id === HOVER_KEY ? ptr.y : active.get(id)!.y;

    if (!entry) {
      entry = createEntry(world, x, y);

      _entries.set(id, entry);
    } else {
      entry.active = true;
    }

    const dx = x - entry.lastX;
    const dy = y - entry.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const instantSpeed = dt > 0 ? dist / dt : 0;
    const alpha = 1 - Math.exp(-dt / SPEED_SMOOTH_TAU);

    entry.smoothedSpeed += (instantSpeed - entry.smoothedSpeed) * alpha;
    entry.lastX = x;
    entry.lastY = y;

    const speedFactor = Math.min(1, entry.smoothedSpeed / SPEED_FOR_MAX_RATE);

    entry.emitter.config.rateOverTime = IDLE_RATE + speedFactor * (MAX_RATE - IDLE_RATE);

    setEmitterPosition(entry.emitter, x, y);
  }

  const toDelete: number[] = [];

  for (const [id, entry] of _entries) {
    if (!liveSet.has(id) && entry.active) {
      entry.active = false;
      entry.emitter.config.rateOverTime = 0;
      entry.smoothedSpeed = 0;
    }

    if (!entry.active && entry.emitter.aliveCount === 0) {
      destroyEmitter(world, entry.emitter);

      toDelete.push(id);
    }
  }

  for (const id of toDelete) _entries.delete(id);

  return world;
}
