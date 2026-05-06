import type { ParticleEmitterState } from '../../engine';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ConnectableStar {
  x: number;
  y: number;
  radius: number;
  haloRadius: number;
  color: RGB;
  pulsePhase: number;
  pulseSpeed: number;
  clusterId: number;
}

export interface ConstellationCluster {
  id: number;
  cx: number;
  cy: number;
  radius: number;
  starIndices: number[];
}

export interface DrawnSegment {
  fromIdx: number;
  toIdx: number;
  bornAt: number;
  duration: number;
  done: boolean;
}

export interface ConstellationDrawing {
  active: boolean;
  cursorWorld: { x: number; y: number };
  sessionStartIdx: number;
  pendingStartIdx: number;
}

export interface ConstellationState {
  stars: ConnectableStar[];
  clusters: ConstellationCluster[];
  selectionPath: number[];
  segments: DrawnSegment[];
  hitGrid: Map<number, number[]>;
  drawing: ConstellationDrawing;
  pendingEmitters: { emitter: ParticleEmitterState; bornAt: number }[];
  closed: boolean;
  hue: RGB | null;
}

export interface BackgroundStarLite {
  x: number;
  y: number;
  radius: number;
}
