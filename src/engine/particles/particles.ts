import type {
  ParticleEmitterConfig, ParticleEmitterState, ParticlePool,
  ParticleSystemState,
  RangeValue, RangeColor, ShapeConfig, Curve, ColorGradient,
  ColorGradientStop,
} from './particles.types.ts';
import {
  SimulationSpace, EmitterShape, ParticleRenderMode, EmitterPlayState,
} from './particles.types.ts';
import type { GameWorld } from '../types.ts';
import { submit } from '../renderer/renderer.ts';

const TAU = Math.PI * 2;
const GRAVITY_PX = 980;

export function createParticleState(): ParticleSystemState {
  return { emitters: [] };
}

export function range(min: number, max: number): RangeValue {
  return { min, max };
}

export function fixed(value: number): RangeValue {
  return { min: value, max: value };
}

export function fixedColor(r: number, g: number, b: number, a = 1): RangeColor {
  return {
    r: { min: r, max: r },
    g: { min: g, max: g },
    b: { min: b, max: b },
    a: { min: a, max: a },
  };
}

export function linear(start: number, end: number): Curve {
  return [{ t: 0, value: start }, { t: 1, value: end }];
}

export function constant(value: number): Curve {
  return [{ t: 0, value }, { t: 1, value }];
}

function sampleRange(r: RangeValue): number {
  return r.min + Math.random() * (r.max - r.min);
}

function sampleShape(shape: ShapeConfig): { x: number; y: number } {
  switch (shape.shape) {
    case EmitterShape.Point:
      return { x: 0, y: 0 };
    case EmitterShape.Circle: {
      const angle = Math.random() * TAU;
      const r = shape.edge ? shape.radius : shape.radius * Math.sqrt(Math.random());
      return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    }
    case EmitterShape.Rectangle:
      return {
        x: (Math.random() - 0.5) * shape.width,
        y: (Math.random() - 0.5) * shape.height,
      };
  }
}

function evaluateCurve(curve: Curve, t: number): number {
  const len = curve.length;
  if (len === 0) return 1;
  if (len === 1) return curve[0].value;
  if (t <= curve[0].t) return curve[0].value;
  if (t >= curve[len - 1].t) return curve[len - 1].value;

  for (let i = 1; i < len; i++) {
    if (t <= curve[i].t) {
      const prev = curve[i - 1];
      const curr = curve[i];
      const segT = (t - prev.t) / (curr.t - prev.t);
      return prev.value + (curr.value - prev.value) * segT;
    }
  }
  return curve[len - 1].value;
}

function evaluateColorGradient(
  gradient: ColorGradient,
  t: number,
  pool: ParticlePool,
  i: number,
): void {
  const len = gradient.length;
  if (len === 0) return;

  let lo: ColorGradientStop;
  let hi: ColorGradientStop;
  let segT: number;

  if (len === 1 || t <= gradient[0].t) {
    lo = gradient[0];
    pool.r[i] = lo.r; pool.g[i] = lo.g; pool.b[i] = lo.b; pool.a[i] = lo.a;
    return;
  }
  if (t >= gradient[len - 1].t) {
    lo = gradient[len - 1];
    pool.r[i] = lo.r; pool.g[i] = lo.g; pool.b[i] = lo.b; pool.a[i] = lo.a;
    return;
  }

  for (let k = 1; k < len; k++) {
    if (t <= gradient[k].t) {
      lo = gradient[k - 1];
      hi = gradient[k];
      segT = (t - lo.t) / (hi.t - lo.t);
      pool.r[i] = lo.r + (hi.r - lo.r) * segT;
      pool.g[i] = lo.g + (hi.g - lo.g) * segT;
      pool.b[i] = lo.b + (hi.b - lo.b) * segT;
      pool.a[i] = lo.a + (hi.a - lo.a) * segT;
      return;
    }
  }
}

const POOL_FLOAT_KEYS: (keyof ParticlePool)[] = [
  'x', 'y', 'vx', 'vy', 'life', 'maxLife',
  'startSize', 'size', 'rotation', 'angularVelocity', 'startSpeed',
  'r', 'g', 'b', 'a', 'startR', 'startG', 'startB', 'startA',
  'spawnX', 'spawnY',
];

function swapParticle(pool: ParticlePool, a: number, b: number): void {
  if (a === b) return;
  for (let k = 0; k < POOL_FLOAT_KEYS.length; k++) {
    const arr = pool[POOL_FLOAT_KEYS[k]] as Float32Array;
    const tmp = arr[a];
    arr[a] = arr[b];
    arr[b] = tmp;
  }
}

function createPool(capacity: number, sortByAge: boolean): ParticlePool {
  return {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    startSize: new Float32Array(capacity),
    size: new Float32Array(capacity),
    rotation: new Float32Array(capacity),
    angularVelocity: new Float32Array(capacity),
    startSpeed: new Float32Array(capacity),
    r: new Float32Array(capacity),
    g: new Float32Array(capacity),
    b: new Float32Array(capacity),
    a: new Float32Array(capacity),
    startR: new Float32Array(capacity),
    startG: new Float32Array(capacity),
    startB: new Float32Array(capacity),
    startA: new Float32Array(capacity),
    spawnX: new Float32Array(capacity),
    spawnY: new Float32Array(capacity),
    sortIndices: sortByAge ? new Uint16Array(capacity) : null,
  };
}

function defaultConfig(): ParticleEmitterConfig {
  return {
    maxParticles: 100,
    duration: 5,
    looping: true,
    playOnAwake: true,
    simulationSpace: SimulationSpace.World,
    rateOverTime: 10,
    bursts: [],
    shape: { shape: EmitterShape.Point },
    directionAngle: { min: 0, max: TAU },
    startLifetime: { min: 1, max: 2 },
    startSpeed: { min: 50, max: 100 },
    startSize: { min: 4, max: 8 },
    startRotation: { min: 0, max: 0 },
    startColor: {
      r: { min: 255, max: 255 },
      g: { min: 255, max: 255 },
      b: { min: 255, max: 255 },
      a: { min: 1, max: 1 },
    },
    gravityModifier: 0,
    sizeOverLifetime: null,
    colorOverLifetime: null,
    speedOverLifetime: null,
    rotationOverLifetime: null,
    renderMode: ParticleRenderMode.Circle,
    sprite: null,
    rectWidth: 1,
    rectHeight: 1,
    blendMode: 'source-over',
    layer: 0,
    order: 0,
    sortByAge: false,
    worldSpace: false,
    depth: 1,
  };
}

function emitParticles(emitter: ParticleEmitterState, count: number): void {
  const cfg = emitter.config;
  const pool = emitter.pool;
  const max = cfg.maxParticles;

  count = Math.min(count, max - emitter.aliveCount);
  if (count <= 0) return;

  const isWorld = cfg.simulationSpace === SimulationSpace.World;

  for (let n = 0; n < count; n++) {
    const idx = emitter.aliveCount++;
    const pos = sampleShape(cfg.shape);

    if (isWorld) {
      pool.x[idx] = emitter.x + pos.x;
      pool.y[idx] = emitter.y + pos.y;
    } else {
      pool.x[idx] = pos.x;
      pool.y[idx] = pos.y;
    }
    pool.spawnX[idx] = emitter.x;
    pool.spawnY[idx] = emitter.y;

    const angle = sampleRange(cfg.directionAngle);
    const speed = sampleRange(cfg.startSpeed);
    pool.vx[idx] = Math.cos(angle) * speed;
    pool.vy[idx] = Math.sin(angle) * speed;
    pool.startSpeed[idx] = speed;

    const lt = sampleRange(cfg.startLifetime);
    pool.life[idx] = lt;
    pool.maxLife[idx] = lt;

    const sz = sampleRange(cfg.startSize);
    pool.startSize[idx] = sz;
    pool.size[idx] = sz;

    pool.rotation[idx] = sampleRange(cfg.startRotation);
    pool.angularVelocity[idx] = cfg.rotationOverLifetime
      ? sampleRange(cfg.rotationOverLifetime)
      : 0;

    const cr = sampleRange(cfg.startColor.r);
    const cg = sampleRange(cfg.startColor.g);
    const cb = sampleRange(cfg.startColor.b);
    const ca = sampleRange(cfg.startColor.a);
    pool.startR[idx] = cr; pool.r[idx] = cr;
    pool.startG[idx] = cg; pool.g[idx] = cg;
    pool.startB[idx] = cb; pool.b[idx] = cb;
    pool.startA[idx] = ca; pool.a[idx] = ca;
  }
}

function submitParticleRender(emitter: ParticleEmitterState, world: GameWorld): void {
  if (emitter.aliveCount === 0) return;

  const cfg = emitter.config;
  const pool = emitter.pool;
  const alive = emitter.aliveCount;
  const renderMode = cfg.renderMode;
  const blendMode = cfg.blendMode;
  const sprite = cfg.sprite;
  const rectW = cfg.rectWidth;
  const rectH = cfg.rectHeight;
  const isLocal = cfg.simulationSpace === SimulationSpace.Local;
  const emX = emitter.x;
  const emY = emitter.y;
  const doSort = cfg.sortByAge;

  submit(world, cfg.layer, cfg.order, (ctx) => {
    ctx.globalCompositeOperation = blendMode;

    let indices: Uint16Array | null = null;
    if (doSort && pool.sortIndices) {
      indices = pool.sortIndices;
      for (let i = 0; i < alive; i++) indices[i] = i;
      indices.subarray(0, alive).sort((a, b) => {
        return (pool.life[a] / pool.maxLife[a]) - (pool.life[b] / pool.maxLife[b]);
      });
    }

    for (let k = 0; k < alive; k++) {
      const i = indices ? indices[k] : k;

      let drawX = pool.x[i];
      let drawY = pool.y[i];
      if (isLocal) {
        drawX += emX;
        drawY += emY;
      }

      const sz = pool.size[i];
      const rot = pool.rotation[i];
      const alpha = pool.a[i];
      const cr = pool.r[i] | 0;
      const cg = pool.g[i] | 0;
      const cb = pool.b[i] | 0;

      ctx.globalAlpha = alpha;
      const color = `rgb(${cr},${cg},${cb})`;

      if (renderMode === ParticleRenderMode.Circle) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(drawX, drawY, sz * 0.5, 0, TAU);
        ctx.fill();
      } else if (renderMode === ParticleRenderMode.Rectangle) {
        const hw = rectW * sz * 0.5;
        const hh = rectH * sz * 0.5;
        if (rot !== 0) {
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.rotate(rot);
          ctx.fillStyle = color;
          ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = color;
          ctx.fillRect(drawX - hw, drawY - hh, hw * 2, hh * 2);
        }
      } else if (renderMode === ParticleRenderMode.Sprite && sprite) {
        const hsz = sz * 0.5;
        if (rot !== 0) {
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.rotate(rot);
          ctx.drawImage(sprite, -hsz, -hsz, sz, sz);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, drawX - hsz, drawY - hsz, sz, sz);
        }
      }
    }
  }, cfg.worldSpace, cfg.depth);
}

export function createEmitter(
  world: GameWorld,
  overrides?: Partial<ParticleEmitterConfig>,
  x = 0,
  y = 0,
): ParticleEmitterState {
  const config = { ...defaultConfig(), ...overrides };

  const emitter: ParticleEmitterState = {
    config,
    state: config.playOnAwake ? EmitterPlayState.Playing : EmitterPlayState.Stopped,
    age: 0,
    loopCount: 0,
    emitAccumulator: 0,
    burstTrackers: config.bursts.map(b => ({
      cyclesFired: 0,
      nextFireTime: b.time,
    })),
    aliveCount: 0,
    pool: createPool(config.maxParticles, config.sortByAge),
    x,
    y,
  };

  world.particles.emitters.push(emitter);
  return emitter;
}

export function destroyEmitter(world: GameWorld, emitter: ParticleEmitterState): void {
  const idx = world.particles.emitters.indexOf(emitter);
  if (idx !== -1) world.particles.emitters.splice(idx, 1);
}

export function playEmitter(emitter: ParticleEmitterState): void {
  emitter.state = EmitterPlayState.Playing;
  emitter.age = 0;
  emitter.loopCount = 0;
  emitter.emitAccumulator = 0;
  resetBurstTrackers(emitter);
}

export function stopEmitter(emitter: ParticleEmitterState, clear = false): void {
  emitter.state = EmitterPlayState.Stopped;
  if (clear) emitter.aliveCount = 0;
}

export function pauseEmitter(emitter: ParticleEmitterState): void {
  if (emitter.state === EmitterPlayState.Playing) {
    emitter.state = EmitterPlayState.Paused;
  }
}

export function resumeEmitter(emitter: ParticleEmitterState): void {
  if (emitter.state === EmitterPlayState.Paused) {
    emitter.state = EmitterPlayState.Playing;
  }
}

export function resetEmitter(emitter: ParticleEmitterState): void {
  emitter.state = EmitterPlayState.Stopped;
  emitter.age = 0;
  emitter.loopCount = 0;
  emitter.emitAccumulator = 0;
  emitter.aliveCount = 0;
  resetBurstTrackers(emitter);
}

export function setEmitterPosition(emitter: ParticleEmitterState, x: number, y: number): void {
  emitter.x = x;
  emitter.y = y;
}

function resetBurstTrackers(emitter: ParticleEmitterState): void {
  const bursts = emitter.config.bursts;
  emitter.burstTrackers.length = bursts.length;
  for (let i = 0; i < bursts.length; i++) {
    if (emitter.burstTrackers[i]) {
      emitter.burstTrackers[i].cyclesFired = 0;
      emitter.burstTrackers[i].nextFireTime = bursts[i].time;
    } else {
      emitter.burstTrackers[i] = { cyclesFired: 0, nextFireTime: bursts[i].time };
    }
  }
}

export function updateEmitter(emitter: ParticleEmitterState, world: GameWorld): void {
  const dt = world.time.delta;
  const cfg = emitter.config;
  const pool = emitter.pool;
  const isPlaying = emitter.state === EmitterPlayState.Playing;

  if (isPlaying) {
    emitter.age += dt;

    if (emitter.age >= cfg.duration) {
      if (cfg.looping) {
        emitter.age -= cfg.duration;
        emitter.loopCount++;
        resetBurstTrackers(emitter);
      } else {
        emitter.state = EmitterPlayState.Stopped;
      }
    }

    if (emitter.state === EmitterPlayState.Playing) {
      emitter.emitAccumulator += cfg.rateOverTime * dt;
      const toEmit = Math.floor(emitter.emitAccumulator);
      emitter.emitAccumulator -= toEmit;
      if (toEmit > 0) emitParticles(emitter, toEmit);

      for (let b = 0; b < cfg.bursts.length; b++) {
        const burst = cfg.bursts[b];
        const tracker = emitter.burstTrackers[b];
        while (tracker.cyclesFired <= burst.cycles && emitter.age >= tracker.nextFireTime) {
          emitParticles(emitter, Math.round(sampleRange(burst.count)));
          tracker.cyclesFired++;
          tracker.nextFireTime += burst.interval;
        }
      }
    }
  }

  if (emitter.state === EmitterPlayState.Paused) {

    submitParticleRender(emitter, world);
    return;
  }

  const gravity = cfg.gravityModifier * GRAVITY_PX;
  const hasSizeCurve = cfg.sizeOverLifetime !== null;
  const hasColorGrad = cfg.colorOverLifetime !== null;
  const hasSpeedCurve = cfg.speedOverLifetime !== null;

  let i = 0;
  while (i < emitter.aliveCount) {
    pool.life[i] -= dt;

    if (pool.life[i] <= 0) {
      swapParticle(pool, i, emitter.aliveCount - 1);
      emitter.aliveCount--;
      continue;
    }

    const t = 1 - pool.life[i] / pool.maxLife[i];

    if (gravity !== 0) {
      pool.vy[i] += gravity * dt;
    }

    if (hasSpeedCurve) {
      const speedMul = evaluateCurve(cfg.speedOverLifetime!, t);
      const curSpeed = Math.sqrt(pool.vx[i] * pool.vx[i] + pool.vy[i] * pool.vy[i]);
      if (curSpeed > 0.0001) {
        const targetSpeed = pool.startSpeed[i] * speedMul;
        const scale = targetSpeed / curSpeed;
        pool.vx[i] *= scale;
        pool.vy[i] *= scale;
      }
    }

    pool.x[i] += pool.vx[i] * dt;
    pool.y[i] += pool.vy[i] * dt;

    if (hasSizeCurve) {
      pool.size[i] = pool.startSize[i] * evaluateCurve(cfg.sizeOverLifetime!, t);
    }

    if (pool.angularVelocity[i] !== 0) {
      pool.rotation[i] += pool.angularVelocity[i] * dt;
    }

    if (hasColorGrad) {
      evaluateColorGradient(cfg.colorOverLifetime!, t, pool, i);
    }

    i++;
  }

  submitParticleRender(emitter, world);
}

export function particleSystem(world: GameWorld): GameWorld {
  const emitters = world.particles.emitters;
  for (let i = 0; i < emitters.length; i++) {
    updateEmitter(emitters[i], world);
  }
  return world;
}
