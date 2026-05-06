export interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

export interface TrailConfig {

  maxPoints: number;

  lifetime: number;

  widthStart: number;

  widthEnd: number;

  color: string;

  alphaStart: number;

  alphaEnd: number;

  minDistance: number;

  smooth: boolean;

  smoothSegments: number;

  roundCap: boolean;

  blendMode: GlobalCompositeOperation;
}

export interface TrailState {
  points: TrailPoint[];
  config: TrailConfig;

  _colorRGB: [number, number, number];
}

export interface PathPoint {
  x: number;
  y: number;

  width?: number;

  alpha?: number;
}

export interface PathConfig {

  width?: number;

  color?: string;

  alpha?: number;

  roundCap?: boolean;

  blendMode?: GlobalCompositeOperation;

  smooth?: boolean;

  smoothSegments?: number;
}
