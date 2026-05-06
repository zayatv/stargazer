import type {CameraState} from './camera.types.ts';
import type { GameWorld } from '../types.ts';

export function createCameraState(overrides?: Partial<CameraState>): CameraState {
  return {
    x: 0, y: 0,
    zoom: 1,
    rotation: 0,
    targetX: 0, targetY: 0,
    targetZoom: 1,
    targetRotation: 0,
    panLerpSpeed: 20,
    zoomLerpSpeed: 10,
    rotateLerpSpeed: 10,
    snapThreshold: 0.01,
    minZoom: 0.1,
    maxZoom: 10,
    bounds: null,
    _halfW: 0,
    _halfH: 0,
    ...overrides,
  };
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function cameraSystem(world: GameWorld): GameWorld {
  const cam = world.camera;
  const dt = world.time.delta;

  cam.targetZoom = clamp(cam.targetZoom, cam.minZoom, cam.maxZoom);

  const tPan = dt > 0 ? 1 - Math.exp(-cam.panLerpSpeed * dt) : 0;
  const tZoom = dt > 0 ? 1 - Math.exp(-cam.zoomLerpSpeed * dt) : 0;
  const tRot = dt > 0 ? 1 - Math.exp(-cam.rotateLerpSpeed * dt) : 0;

  cam.x += (cam.targetX - cam.x) * tPan;
  cam.y += (cam.targetY - cam.y) * tPan;

  if (cam.zoom > 0 && cam.targetZoom > 0) {
    const logZoom = Math.log(cam.zoom);
    const logTarget = Math.log(cam.targetZoom);

    cam.zoom = Math.exp(logZoom + (logTarget - logZoom) * tZoom);
  }

  cam.rotation += (cam.targetRotation - cam.rotation) * tRot;

  if (Math.abs(cam.targetX - cam.x) < cam.snapThreshold && Math.abs(cam.targetY - cam.y) < cam.snapThreshold) {
    cam.x = cam.targetX;
    cam.y = cam.targetY;
  }
  if (Math.abs(cam.targetZoom - cam.zoom) < cam.snapThreshold * cam.zoom) {
    cam.zoom = cam.targetZoom;
  }
  if (Math.abs(cam.targetRotation - cam.rotation) < cam.snapThreshold) {
    cam.rotation = cam.targetRotation;
  }

  cam.zoom = clamp(cam.zoom, cam.minZoom, cam.maxZoom);

  const screenW = world.canvas.clientWidth;
  const screenH = world.canvas.clientHeight;
  const baseHalfW = (screenW / cam.zoom) * 0.5;
  const baseHalfH = (screenH / cam.zoom) * 0.5;
  const absCos = Math.abs(Math.cos(cam.rotation));
  const absSin = Math.abs(Math.sin(cam.rotation));

  cam._halfW = baseHalfW * absCos + baseHalfH * absSin;
  cam._halfH = baseHalfW * absSin + baseHalfH * absCos;

  if (cam.bounds) {
    const b = cam.bounds;
    const minX = b.minX + cam._halfW;
    const minY = b.minY + cam._halfH;
    const maxX = b.maxX - cam._halfW;
    const maxY = b.maxY - cam._halfH;

    if (minX > maxX) {
      const midX = (b.minX + b.maxX) * 0.5;

      cam.x = midX;
      cam.targetX = midX;
    } else {
      cam.x = clamp(cam.x, minX, maxX);
      cam.targetX = clamp(cam.targetX, minX, maxX);
    }
    if (minY > maxY) {
      const midY = (b.minY + b.maxY) * 0.5;

      cam.y = midY;
      cam.targetY = midY;
    } else {
      cam.y = clamp(cam.y, minY, maxY);
      cam.targetY = clamp(cam.targetY, minY, maxY);
    }
  }

  return world;
}

export function screenToWorld(camera: CameraState, screenW: number, screenH: number, sx: number, sy: number): { x: number; y: number } {
  const cx = sx - screenW * 0.5;
  const cy = sy - screenH * 0.5;

  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const rx = cx * cos - cy * sin;
  const ry = cx * sin + cy * cos;

  return {
    x: rx / camera.zoom + camera.x,
    y: ry / camera.zoom + camera.y,
  };
}

export function worldToScreen(camera: CameraState, screenW: number, screenH: number, wx: number, wy: number): { x: number; y: number } {
  const dx = wx - camera.x;
  const dy = wy - camera.y;

  const cos = Math.cos(-camera.rotation);
  const sin = Math.sin(-camera.rotation);
  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  return {
    x: rx * camera.zoom + screenW * 0.5,
    y: ry * camera.zoom + screenH * 0.5,
  };
}

export function applyCameraTransform(ctx: CanvasRenderingContext2D, camera: CameraState, screenW: number, screenH: number): void {
  ctx.translate(screenW * 0.5, screenH * 0.5);
  ctx.scale(camera.zoom, camera.zoom);

  if (camera.rotation !== 0) {
    ctx.rotate(-camera.rotation);
  }

  ctx.translate(-camera.x, -camera.y);
}

export function zoomAt(camera: CameraState, screenW: number, screenH: number, sx: number, sy: number, zoomDelta: number): void {
  const before = screenToWorld(camera, screenW, screenH, sx, sy);

  camera.targetZoom = clamp(camera.targetZoom * zoomDelta, camera.minZoom, camera.maxZoom);

  const newZoom = camera.targetZoom;
  const cx = sx - screenW * 0.5;
  const cy = sy - screenH * 0.5;

  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const rx = cx * cos - cy * sin;
  const ry = cx * sin + cy * cos;

  camera.targetX = before.x - rx / newZoom;
  camera.targetY = before.y - ry / newZoom;
}

export function panBy(camera: CameraState, screenDX: number, screenDY: number): void {
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  const rx = screenDX * cos - screenDY * sin;
  const ry = screenDX * sin + screenDY * cos;

  camera.targetX -= rx / camera.zoom;
  camera.targetY -= ry / camera.zoom;
}

export function setPosition(camera: CameraState, x: number, y: number, immediate = false): void {
  camera.targetX = x;
  camera.targetY = y;

  if (immediate) {
    camera.x = x;
    camera.y = y;
  }
}

export function setZoom(camera: CameraState, zoom: number, immediate = false): void {
  camera.targetZoom = clamp(zoom, camera.minZoom, camera.maxZoom);

  if (immediate) {
    camera.zoom = camera.targetZoom;
  }
}

export function rotateBy(camera: CameraState, deltaRadians: number, immediate = false): void {
  camera.targetRotation += deltaRadians;

  if (immediate) {
    camera.rotation += deltaRadians;
  }
}

export function rotateAt(camera: CameraState, screenW: number, screenH: number, sx: number, sy: number, deltaRadians: number): void {
  const before = screenToWorld(camera, screenW, screenH, sx, sy);

  camera.targetRotation += deltaRadians;

  const newRot = camera.targetRotation;
  const cx = sx - screenW * 0.5;
  const cy = sy - screenH * 0.5;

  const cos = Math.cos(newRot);
  const sin = Math.sin(newRot);
  const rx = cx * cos - cy * sin;
  const ry = cx * sin + cy * cos;

  camera.targetX = before.x - rx / camera.targetZoom;
  camera.targetY = before.y - ry / camera.targetZoom;
}
