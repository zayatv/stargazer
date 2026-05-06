import type { TimeState } from './time.types.ts';
import type { GameWorld } from '../types.ts';

export function createTimeState(fpsSamples = 60): TimeState {
  return {
    delta: 0,
    unscaledDelta: 0,
    timeScale: 1,
    elapsed: 0,
    unscaledElapsed: 0,
    frame: 0,
    fps: 0,
    maxDelta: 0.1,
    fixedStep: 0,
    fixedInterval: 1 / 60,
    _lastTime: 0,
    _frameTimes: new Float64Array(fpsSamples),
    _frameTimeIdx: 0,
  };
}

export function timeSystem(world: GameWorld): GameWorld {
  const t = world.time;
  const now = performance.now();

  if (t._lastTime === 0) {
    t._lastTime = now;

    return world;
  }

  const rawDelta = (now - t._lastTime) / 1000;

  t._lastTime = now;

  t.unscaledDelta = Math.min(rawDelta, t.maxDelta);
  t.delta = t.unscaledDelta * t.timeScale;

  t.elapsed += t.delta;
  t.unscaledElapsed += t.unscaledDelta;

  t.frame++;

  t.fixedStep += t.unscaledDelta;

  const buf = t._frameTimes;
  const idx = t._frameTimeIdx % buf.length;

  buf[idx] = t.unscaledDelta;

  t._frameTimeIdx++;

  const sampleCount = Math.min(t._frameTimeIdx, buf.length);

  let sum = 0;

  for (let i = 0; i < sampleCount; i++) {
    sum += buf[i];
  }

  t.fps = sum > 0 ? sampleCount / sum : 0;

  return world;
}
