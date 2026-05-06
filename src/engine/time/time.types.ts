export interface TimeState {
  delta: number;
  unscaledDelta: number;
  timeScale: number;
  elapsed: number;
  unscaledElapsed: number;
  frame: number;
  fps: number;
  maxDelta: number;
  fixedStep: number;
  fixedInterval: number;
  _lastTime: number;
  _frameTimes: Float64Array;
  _frameTimeIdx: number;
}
