export interface CameraBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
  targetRotation: number;
  panLerpSpeed: number;
  zoomLerpSpeed: number;
  rotateLerpSpeed: number;
  snapThreshold: number;
  minZoom: number;
  maxZoom: number;
  bounds: CameraBounds | null;
  _halfW: number;
  _halfH: number;
}