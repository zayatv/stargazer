export const SimulationSpace = { World: 0, Local: 1 } as const;
export type SimulationSpace = (typeof SimulationSpace)[keyof typeof SimulationSpace];

export const EmitterShape = { Point: 0, Circle: 1, Rectangle: 2 } as const;
export type EmitterShape = (typeof EmitterShape)[keyof typeof EmitterShape];

export const ParticleRenderMode = { Circle: 0, Rectangle: 1, Sprite: 2 } as const;
export type ParticleRenderMode = (typeof ParticleRenderMode)[keyof typeof ParticleRenderMode];

export const EmitterPlayState = { Stopped: 0, Playing: 1, Paused: 2 } as const;
export type EmitterPlayState = (typeof EmitterPlayState)[keyof typeof EmitterPlayState];

export interface RangeValue {
  min: number;
  max: number;
}

export interface RangeColor {
  r: RangeValue;
  g: RangeValue;
  b: RangeValue;
  a: RangeValue;
}

export interface CurveKeyframe {
  t: number;
  value: number;
}

export type Curve = CurveKeyframe[];

export interface ColorGradientStop {
  t: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColorGradient = ColorGradientStop[];

export interface BurstConfig {

  time: number;
  count: RangeValue;

  cycles: number;

  interval: number;
}

export interface ShapePointConfig {
  shape: typeof EmitterShape.Point;
}

export interface ShapeCircleConfig {
  shape: typeof EmitterShape.Circle;
  radius: number;

  edge: boolean;
}

export interface ShapeRectangleConfig {
  shape: typeof EmitterShape.Rectangle;
  width: number;
  height: number;
}

export type ShapeConfig = ShapePointConfig | ShapeCircleConfig | ShapeRectangleConfig;

export interface ParticlePool {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  startSize: Float32Array;
  size: Float32Array;
  rotation: Float32Array;
  angularVelocity: Float32Array;
  startSpeed: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  a: Float32Array;
  startR: Float32Array;
  startG: Float32Array;
  startB: Float32Array;
  startA: Float32Array;
  spawnX: Float32Array;
  spawnY: Float32Array;
  sortIndices: Uint16Array | null;
}

export interface ParticleEmitterConfig {
  maxParticles: number;
  duration: number;
  looping: boolean;
  playOnAwake: boolean;
  simulationSpace: SimulationSpace;

  rateOverTime: number;
  bursts: BurstConfig[];

  shape: ShapeConfig;
  directionAngle: RangeValue;

  startLifetime: RangeValue;
  startSpeed: RangeValue;
  startSize: RangeValue;
  startRotation: RangeValue;
  startColor: RangeColor;
  gravityModifier: number;

  sizeOverLifetime: Curve | null;
  colorOverLifetime: ColorGradient | null;
  speedOverLifetime: Curve | null;

  rotationOverLifetime: RangeValue | null;

  renderMode: ParticleRenderMode;
  sprite: CanvasImageSource | null;
  rectWidth: number;
  rectHeight: number;
  blendMode: GlobalCompositeOperation;
  layer: number;
  order: number;
  sortByAge: boolean;
  worldSpace: boolean;

  depth: number;
}

export interface BurstTracker {
  cyclesFired: number;
  nextFireTime: number;
}

export interface ParticleEmitterState {
  config: ParticleEmitterConfig;
  state: EmitterPlayState;
  age: number;
  loopCount: number;
  emitAccumulator: number;
  burstTrackers: BurstTracker[];
  aliveCount: number;
  pool: ParticlePool;
  x: number;
  y: number;
}

export interface ParticleSystemState {
  emitters: ParticleEmitterState[];
}
