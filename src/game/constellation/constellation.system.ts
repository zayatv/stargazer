import type { GameWorld } from '../../engine/types.ts';
import type { CameraState } from '../../engine/camera/index.ts';
import { screenToWorld } from '../../engine/camera/index.ts';
import {
  createEmitter, destroyEmitter, range, fixedColor,
} from '../../engine/particles/index.ts';
import type { ConstellationState, RGB } from './constellation.types.ts';
import { cellKey, HIT_CELL_SIZE } from './constellation.generator.ts';
import {playSound} from "../../engine";

const HUE_PALETTE: RGB[] = [
  { r: 245, g: 200, b: 130 },
  { r: 245, g: 165, b: 200 },
  { r: 130, g: 230, b: 220 },
  { r: 200, g: 165, b: 245 },
  { r: 165, g: 230, b: 195 },
  { r: 245, g: 200, b: 165 },
  { r: 165, g: 215, b: 245 },
  { r: 230, g: 165, b: 245 },
];

const SEGMENT_DURATION = 0.25;
const HIT_RADIUS_HALO_FRACTION = 0.65;
const HIT_RADIUS_RADIUS_MULT = 1.8;
const DRAG_BACK_HALO_FRACTION = 0.55;
const SPARKLE_LIFETIME_CAP = 0.8;
const MIN_STARS_TO_CLOSE = 3;

export const STAR_CONNECTION_SOUND_KEY = 'constellation-connection';
export const STAR_CONNECTION_SOUND_URL = '/audio/sfx/sfx_nightsky_star_connect.mp3';

function pickHue(): RGB {
  return HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)];
}

function ensureHue(state: ConstellationState): void {
  if (!state.hue) state.hue = pickHue();
}

function maybeResetHue(state: ConstellationState): void {
  if (state.selectionPath.length === 0 && state.segments.length === 0) {
    state.hue = null;
  }
}

export function findConnectableStarAt(state: ConstellationState, camera: CameraState, screenW: number, screenH: number, sx: number, sy: number, excludePathExceptLast = false): number {
  const { x: wx, y: wy } = screenToWorld(camera, screenW, screenH, sx, sy);
  const cx = Math.floor(wx / HIT_CELL_SIZE);
  const cy = Math.floor(wy / HIT_CELL_SIZE);
  const path = state.selectionPath;
  const last = path.length > 0 ? path[path.length - 1] : -1;

  let best = -1;
  let bestD2 = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = state.hitGrid.get(cellKey(cx + dx, cy + dy));

      if (!cell) continue;

      for (const idx of cell) {
        if (excludePathExceptLast && idx !== last && path.includes(idx)) continue;

        const s = state.stars[idx];
        const tol = Math.max(s.haloRadius * HIT_RADIUS_HALO_FRACTION, s.radius * HIT_RADIUS_RADIUS_MULT);
        const ex = s.x - wx;
        const ey = s.y - wy;
        const d2 = ex * ex + ey * ey;

        if (d2 < tol * tol && d2 < bestD2) {
          best = idx;
          bestD2 = d2;
        }
      }
    }
  }

  return best;
}

function spawn(world: GameWorld, state: ConstellationState, x: number, y: number, count: number): void {
  const hue = state.hue;
  const midR = hue ? Math.round(200 + (hue.r - 200) * 0.5) : 200;
  const midG = hue ? Math.round(215 + (hue.g - 215) * 0.5) : 215;
  const midB = hue ? Math.round(255 + (hue.b - 255) * 0.5) : 255;
  const tailR = hue ? hue.r : 180;
  const tailG = hue ? hue.g : 160;
  const tailB = hue ? hue.b : 230;

  const e = createEmitter(world, {
    maxParticles: 16,
    duration: 0.1,
    looping: false,
    playOnAwake: true,
    rateOverTime: 0,
    bursts: [{ time: 0, count: { min: count, max: count }, cycles: 1, interval: 0 }],
    startLifetime: range(0.3, 0.55),
    startSpeed: range(20, 60),
    startSize: range(1, 2.5),
    startColor: fixedColor(230, 235, 255),
    directionAngle: range(0, Math.PI * 2),
    gravityModifier: -0.005,
    sizeOverLifetime: [
      { t: 0, value: 1 },
      { t: 1, value: 0 },
    ],
    colorOverLifetime: [
      { t: 0,   r: 255, g: 255, b: 255, a: 1 },
      { t: 0.5, r: midR, g: midG, b: midB, a: 0.7 },
      { t: 1,   r: tailR, g: tailG, b: tailB, a: 0 },
    ],
    blendMode: 'lighter',
    worldSpace: true,
    layer: 60,
    order: 0,
  }, x, y);

  state.pendingEmitters.push({ emitter: e, bornAt: world.time.elapsed });
}

function spawnSelectSparkle(world: GameWorld, state: ConstellationState, x: number, y: number): void {
  spawn(world, state, x, y, 9);
}

function spawnArrivalSparkle(world: GameWorld, state: ConstellationState, x: number, y: number): void {
  spawn(world, state, x, y, 13);
}

export function undoLastSegment(world: GameWorld, state: ConstellationState): void {
  if (state.closed) {
    state.closed = false;

    if (state.segments.length > 0) state.segments.pop();

    const first = state.stars[state.selectionPath[0]];

    spawnSelectSparkle(world, state, first.x, first.y);

    return;
  }

  if (state.selectionPath.length === 0) return;

  const popped = state.selectionPath.pop()!;

  if (state.segments.length > 0) state.segments.pop();

  const s = state.stars[popped];

  spawnSelectSparkle(world, state, s.x, s.y);

  if (state.segments.length === 0 && state.selectionPath.length === 1) {
    state.selectionPath.pop();
  }

  maybeResetHue(state);
}

export function updateConstellationSystem(world: GameWorld, state: ConstellationState): void {
  const ptr = world.input.pointer;
  const rec = world.input._recognizer;
  const cam = world.camera;
  const sw = world.canvas.clientWidth;
  const sh = world.canvas.clientHeight;
  const time = world.time.elapsed;

  if (state.drawing.active && rec._touchCount > 1) {
    state.drawing.active = false;
    state.drawing.pendingStartIdx = -1;
  }

  if (ptr.pressed && rec._touchCount <= 1 && !state.closed) {
    const hit = findConnectableStarAt(state, cam, sw, sh, ptr.x, ptr.y);

    if (hit !== -1) {
      const path = state.selectionPath;
      const lastIdx = path.length > 0 ? path[path.length - 1] : -1;

      if (path.length === 0) {
        state.drawing.active = true;
        state.drawing.sessionStartIdx = -1;
        state.drawing.pendingStartIdx = hit;
      } else if (lastIdx === hit) {
        state.drawing.active = true;
        state.drawing.sessionStartIdx = path.length - 1;
        state.drawing.pendingStartIdx = -1;
      }

      if (state.drawing.active) {
        const w = screenToWorld(cam, sw, sh, ptr.x, ptr.y);

        state.drawing.cursorWorld.x = w.x;
        state.drawing.cursorWorld.y = w.y;
      }
    }
  }

  if (state.drawing.active && ptr.down) {
    const w = screenToWorld(cam, sw, sh, ptr.x, ptr.y);

    state.drawing.cursorWorld.x = w.x;
    state.drawing.cursorWorld.y = w.y;

    const path = state.selectionPath;

    if (state.drawing.pendingStartIdx === -1 && path.length - 1 > state.drawing.sessionStartIdx) {
      const prevIdx = path[path.length - 2];
      const prev = state.stars[prevIdx];
      const dx = w.x - prev.x;
      const dy = w.y - prev.y;
      const snapR = prev.haloRadius * DRAG_BACK_HALO_FRACTION;

      if (dx * dx + dy * dy < snapR * snapR) {
        path.pop();
        state.segments.pop();

        spawnSelectSparkle(world, state, prev.x, prev.y);

        if (state.segments.length === 0 && path.length === 1) {
          const lonely = path.pop()!;

          state.drawing.pendingStartIdx = lonely;
          state.drawing.sessionStartIdx = -1;
        }

        maybeResetHue(state);
      }
    }

    let closedThisFrame = false;

    if (!state.closed && state.drawing.pendingStartIdx === -1 && path.length >= MIN_STARS_TO_CLOSE) {
      const first = state.stars[path[0]];
      const dx = w.x - first.x;
      const dy = w.y - first.y;
      const tol = Math.max(first.haloRadius * HIT_RADIUS_HALO_FRACTION, first.radius * HIT_RADIUS_RADIUS_MULT);

      if (dx * dx + dy * dy < tol * tol) {
        ensureHue(state);

        state.segments.push({
          fromIdx: path[path.length - 1],
          toIdx: path[0],
          bornAt: time,
          duration: SEGMENT_DURATION,
          done: false,
        });

        playSound(world.audio, STAR_CONNECTION_SOUND_KEY);

        state.closed = true;
        state.drawing.active = false;
        state.drawing.pendingStartIdx = -1;

        spawnArrivalSparkle(world, state, first.x, first.y);

        closedThisFrame = true;
      }
    }

    if (!closedThisFrame) {
      const cand = findConnectableStarAt(state, cam, sw, sh, ptr.x, ptr.y, true);
      const fromIdx = state.drawing.pendingStartIdx !== -1 ? state.drawing.pendingStartIdx : (path.length > 0 ? path[path.length - 1] : -1);

      if (cand !== -1 && cand !== fromIdx && !path.includes(cand) && fromIdx !== -1) {
        ensureHue(state);

        if (state.drawing.pendingStartIdx !== -1) {
          path.push(state.drawing.pendingStartIdx);

          spawnSelectSparkle(world, state, state.stars[state.drawing.pendingStartIdx].x, state.stars[state.drawing.pendingStartIdx].y);

          state.drawing.sessionStartIdx = path.length - 1;
          state.drawing.pendingStartIdx = -1;
        }

        state.segments.push({
          fromIdx: path[path.length - 1],
          toIdx: cand,
          bornAt: time,
          duration: SEGMENT_DURATION,
          done: false,
        });

        playSound(world.audio, STAR_CONNECTION_SOUND_KEY);

        path.push(cand);

        spawnSelectSparkle(world, state, state.stars[cand].x, state.stars[cand].y);
      }
    }
  }

  if (ptr.released && state.drawing.active) {
    state.drawing.active = false;
    state.drawing.pendingStartIdx = -1;
  }

  for (const seg of state.segments) {
    if (!seg.done) {
      const t = (time - seg.bornAt) / seg.duration;

      if (t >= 1) {
        seg.done = true;

        const to = state.stars[seg.toIdx];

        spawnArrivalSparkle(world, state, to.x, to.y);
      }
    }
  }

  for (let i = state.pendingEmitters.length - 1; i >= 0; i--) {
    if (time - state.pendingEmitters[i].bornAt > SPARKLE_LIFETIME_CAP) {
      destroyEmitter(world, state.pendingEmitters[i].emitter);

      state.pendingEmitters.splice(i, 1);
    }
  }
}

export function disposeConstellation(world: GameWorld, state: ConstellationState): void {
  for (const pe of state.pendingEmitters) {
    destroyEmitter(world, pe.emitter);
  }

  state.pendingEmitters.length = 0;
  state.segments.length = 0;
  state.selectionPath.length = 0;
  state.drawing.active = false;
  state.drawing.pendingStartIdx = -1;
  state.closed = false;
  state.hue = null;
}
