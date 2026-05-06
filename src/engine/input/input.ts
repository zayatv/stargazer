import type {
  InputState, InputConfig, RawPointerEvent,
  ActivePointer, PointerKind,
} from './input.types.ts';
import { PointerPhase, GestureType } from './input.types.ts';
import type { GameWorld } from '../types.ts';

export function createInputState(overrides?: Partial<InputConfig>): InputState {
  return {
    pointer: {
      down: false,
      x: 0, y: 0,
      dx: 0, dy: 0,
      pressed: false,
      released: false,
      pointerId: -1,
      hovering: false,
      kind: 'none',
    },
    gesture: {
      type: GestureType.None,
      tapped: false,
      tapX: 0, tapY: 0,
      dragging: false,
      dragDX: 0, dragDY: 0,
      zoomDelta: 1,
      zoomX: 0, zoomY: 0,
      rotateDelta: 0,
      rotateX: 0, rotateY: 0,
    },
    keys: {
      held: new Set(),
      pressed: new Set(),
      released: new Set(),
    },
    config: {
      dragThreshold: 8,
      tapMaxDuration: 300,
      wheelZoomSensitivity: 0.001,
      wheelRotateSensitivity: Math.PI / 600,
      pinchThreshold: 10,
      rotateThreshold: 0.05,
      ...overrides,
    },
    _rawPointers: [],
    _rawWheel: [],
    _rawKeys: [],
    _recognizer: {
      _touchCount: 0,
      _activePointers: new Map(),
      _prevPinchDist: 0,
      _prevPinchAngle: 0,
      _dragStarted: false,
      _primaryId: -1,
      _pinchAccum: 0,
      _rotateAccum: 0,
    },
    _listeners: null,
    _canvas: null,
  };
}

function canvasCoords(e: PointerEvent | WheelEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();

  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function attachInputListeners(canvas: HTMLCanvasElement, state: InputState): void {
  const ptrType = (e: PointerEvent): PointerKind =>
    (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') ? e.pointerType : 'mouse';

  const pointerdown = (e: PointerEvent) => {
    e.preventDefault();

    const pos = canvasCoords(e, canvas);

    state._rawPointers.push({
      pointerId: e.pointerId,
      x: pos.x, y: pos.y,
      phase: PointerPhase.Began,
      button: e.button,
      timeStamp: e.timeStamp,
      pointerType: ptrType(e),
    });

    canvas.setPointerCapture(e.pointerId);
  };

  const pointermove = (e: PointerEvent) => {
    e.preventDefault();

    const pos = canvasCoords(e, canvas);

    state._rawPointers.push({
      pointerId: e.pointerId,
      x: pos.x, y: pos.y,
      phase: PointerPhase.Moved,
      button: e.button,
      timeStamp: e.timeStamp,
      pointerType: ptrType(e),
    });
  };

  const pointerup = (e: PointerEvent) => {
    const pos = canvasCoords(e, canvas);

    state._rawPointers.push({
      pointerId: e.pointerId,
      x: pos.x, y: pos.y,
      phase: PointerPhase.Ended,
      button: e.button,
      timeStamp: e.timeStamp,
      pointerType: ptrType(e),
    });
  };

  const pointercancel = (e: PointerEvent) => {
    const pos = canvasCoords(e, canvas);

    state._rawPointers.push({
      pointerId: e.pointerId,
      x: pos.x, y: pos.y,
      phase: PointerPhase.Cancelled,
      button: e.button,
      timeStamp: e.timeStamp,
      pointerType: ptrType(e),
    });
  };

  const pointerleave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;

    state.pointer.hovering = false;
  };

  const wheel = (e: WheelEvent) => {
    e.preventDefault();

    const pos = canvasCoords(e, canvas);

    state._rawWheel.push({
      x: pos.x, y: pos.y,
      deltaX: e.deltaX, deltaY: e.deltaY,
      deltaMode: e.deltaMode,
    });
  };

  const keydown = (e: KeyboardEvent) => {
    if (e.repeat) return;

    state._rawKeys.push({ code: e.code, key: e.key, down: true });
  };

  const keyup = (e: KeyboardEvent) => {
    state._rawKeys.push({ code: e.code, key: e.key, down: false });
  };

  const contextmenu = (e: Event) => {
    e.preventDefault();
  };

  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointercancel);
  canvas.addEventListener('pointerleave', pointerleave);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('contextmenu', contextmenu);

  state._listeners = {
    pointerdown, pointermove, pointerup, pointercancel, pointerleave,
    wheel, keydown, keyup, contextmenu,
  };

  state._canvas = canvas;
}

export function detachInputListeners(state: InputState): void {
  if (!state._listeners || !state._canvas) return;

  const canvas = state._canvas;
  const l = state._listeners;

  canvas.removeEventListener('pointerdown', l.pointerdown);
  canvas.removeEventListener('pointermove', l.pointermove);
  canvas.removeEventListener('pointerup', l.pointerup);
  canvas.removeEventListener('pointercancel', l.pointercancel);
  canvas.removeEventListener('pointerleave', l.pointerleave);
  canvas.removeEventListener('wheel', l.wheel);
  window.removeEventListener('keydown', l.keydown);
  window.removeEventListener('keyup', l.keyup);
  canvas.removeEventListener('contextmenu', l.contextmenu);

  state._listeners = null;
  state._canvas = null;
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;

  return dx * dx + dy * dy;
}

function pinchDistance(pointers: Map<number, ActivePointer>): number {
  const iter = pointers.values();
  const a = iter.next().value!;
  const b = iter.next().value!;

  return Math.sqrt(distSq(a.x, a.y, b.x, b.y));
}

function pinchMidpoint(pointers: Map<number, ActivePointer>): { x: number; y: number } {
  const iter = pointers.values();
  const a = iter.next().value!;
  const b = iter.next().value!;

  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function pinchAngle(pointers: Map<number, ActivePointer>): number {
  const iter = pointers.values();
  const a = iter.next().value!;
  const b = iter.next().value!;

  return Math.atan2(b.y - a.y, b.x - a.x);
}

function processPointerEvent(state: InputState, evt: RawPointerEvent): void {
  const rec = state._recognizer;
  const ptr = state.pointer;

  ptr.kind = evt.pointerType;

  if (evt.pointerType !== 'touch' && evt.phase !== PointerPhase.Cancelled) {
    ptr.hovering = true;
  }

  switch (evt.phase) {
    case PointerPhase.Began: {
      rec._activePointers.set(evt.pointerId, {
        startX: evt.x, startY: evt.y,
        startTime: evt.timeStamp,
        x: evt.x, y: evt.y,
      });

      rec._touchCount++;

      if (rec._touchCount === 1) {
        rec._primaryId = evt.pointerId;
        rec._dragStarted = false;
        ptr.down = true;
        ptr.pressed = true;
        ptr.pointerId = evt.pointerId;
        ptr.x = evt.x;
        ptr.y = evt.y;
      }

      if (rec._touchCount === 2) {
        rec._prevPinchDist = pinchDistance(rec._activePointers);
        rec._prevPinchAngle = pinchAngle(rec._activePointers);
        rec._pinchAccum = 0;
        rec._rotateAccum = 0;
      }

      break;
    }

    case PointerPhase.Moved: {
      const ap = rec._activePointers.get(evt.pointerId);

      if (ap) {
        ap.x = evt.x;
        ap.y = evt.y;
      }

      if (evt.pointerId === rec._primaryId || rec._primaryId === -1) {
        ptr.dx += evt.x - ptr.x;
        ptr.dy += evt.y - ptr.y;
        ptr.x = evt.x;
        ptr.y = evt.y;
      }

      break;
    }

    case PointerPhase.Ended:
    case PointerPhase.Cancelled: {
      const ap = rec._activePointers.get(evt.pointerId);

      rec._activePointers.delete(evt.pointerId);
      rec._touchCount = Math.max(0, rec._touchCount - 1);

      if (evt.pointerId === rec._primaryId) {
        ptr.down = false;
        ptr.released = true;
        ptr.x = evt.x;
        ptr.y = evt.y;

        if (evt.phase === PointerPhase.Ended && ap && !rec._dragStarted) {
          const duration = evt.timeStamp - ap.startTime;
          const dist = Math.sqrt(distSq(ap.startX, ap.startY, evt.x, evt.y));

          if (duration <= state.config.tapMaxDuration && dist <= state.config.dragThreshold) {
            state.gesture.tapped = true;
            state.gesture.tapX = evt.x;
            state.gesture.tapY = evt.y;
            state.gesture.type = GestureType.Tap;
          }
        }

        rec._primaryId = -1;
        rec._dragStarted = false;
      }

      if (rec._touchCount < 2) {
        rec._prevPinchDist = 0;
        rec._prevPinchAngle = 0;
        rec._pinchAccum = 0;
        rec._rotateAccum = 0;
      }

      break;
    }
  }
}

export function inputSystem(world: GameWorld): GameWorld {
  const state = world.input;
  const ptr = state.pointer;
  const ges = state.gesture;
  const keys = state.keys;
  const rec = state._recognizer;

  ptr.pressed = false;
  ptr.released = false;
  ptr.dx = 0;
  ptr.dy = 0;
  ges.tapped = false;
  ges.dragging = false;
  ges.dragDX = 0;
  ges.dragDY = 0;
  ges.zoomDelta = 1;
  ges.rotateDelta = 0;
  ges.type = GestureType.None;

  keys.pressed.clear();
  keys.released.clear();

  for (let i = 0; i < state._rawKeys.length; i++) {
    const k = state._rawKeys[i];

    if (k.down) {
      keys.held.add(k.code);
      keys.pressed.add(k.code);
    } else {
      keys.held.delete(k.code);
      keys.released.add(k.code);
    }
  }
  state._rawKeys.length = 0;

  for (let i = 0; i < state._rawPointers.length; i++) {
    processPointerEvent(state, state._rawPointers[i]);
  }

  state._rawPointers.length = 0;

  if (ptr.down && rec._touchCount === 1 && rec._primaryId !== -1) {
    const ap = rec._activePointers.get(rec._primaryId);

    if (ap) {
      if (!rec._dragStarted) {
        const dist = Math.sqrt(distSq(ap.startX, ap.startY, ptr.x, ptr.y));

        if (dist > state.config.dragThreshold) {
          rec._dragStarted = true;
        }
      }
      if (rec._dragStarted) {
        ges.dragging = true;
        ges.dragDX = ptr.dx;
        ges.dragDY = ptr.dy;

        if (ges.type === GestureType.None) {
          ges.type = GestureType.Drag;
        }
      }
    }
  }

  if (rec._touchCount >= 2 && rec._activePointers.size >= 2) {
    const curDist = pinchDistance(rec._activePointers);
    const curAngle = pinchAngle(rec._activePointers);
    const mid = pinchMidpoint(rec._activePointers);

    let distDelta = 1;
    let absPinchChange = 0;

    if (rec._prevPinchDist > 0 && curDist > 0) {
      distDelta = curDist / rec._prevPinchDist;
      absPinchChange = Math.abs(curDist - rec._prevPinchDist);
    }

    let angleDelta = 0;

    if (rec._prevPinchAngle !== 0) {
      angleDelta = curAngle - rec._prevPinchAngle;

      if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
    }

    const decay = Math.exp(-10 * world.time.unscaledDelta);

    rec._pinchAccum = rec._pinchAccum * decay + absPinchChange;
    rec._rotateAccum = rec._rotateAccum * decay + Math.abs(angleDelta);

    if (rec._pinchAccum >= state.config.pinchThreshold && distDelta !== 1) {
      ges.zoomDelta *= distDelta;
      ges.zoomX = mid.x;
      ges.zoomY = mid.y;
      ges.type = GestureType.Pinch;
    }

    if (rec._rotateAccum >= state.config.rotateThreshold && angleDelta !== 0) {
      ges.rotateDelta -= angleDelta;
      ges.rotateX = mid.x;
      ges.rotateY = mid.y;

      if (ges.type === GestureType.None) {
        ges.type = GestureType.Rotate;
      }
    }

    rec._prevPinchDist = curDist;
    rec._prevPinchAngle = curAngle;
  }

  let totalDeltaY = 0;
  let lastWheelX = 0;
  let lastWheelY = 0;

  for (let i = 0; i < state._rawWheel.length; i++) {
    const w = state._rawWheel[i];

    let dy = w.deltaY;

    if (w.deltaMode === 1) dy *= 20;
    else if (w.deltaMode === 2) dy *= globalThis.innerHeight || 600;

    totalDeltaY += dy;
    lastWheelX = w.x;
    lastWheelY = w.y;
  }
  if (state._rawWheel.length > 0) {
    if (keys.held.has('ShiftLeft') || keys.held.has('ShiftRight')) {
      ges.rotateDelta += totalDeltaY * state.config.wheelRotateSensitivity;
      ges.rotateX = lastWheelX;
      ges.rotateY = lastWheelY;

      if (ges.type === GestureType.None) {
        ges.type = GestureType.Rotate;
      }
    } else {
      const wheelZoom = Math.exp(-totalDeltaY * state.config.wheelZoomSensitivity);

      ges.zoomDelta *= wheelZoom;
      ges.zoomX = lastWheelX;
      ges.zoomY = lastWheelY;

      if (ges.type === GestureType.None) {
        ges.type = GestureType.Pinch;
      }
    }
  }

  state._rawWheel.length = 0;

  return world;
}

export function isKeyHeld(state: InputState, code: string): boolean {
  return state.keys.held.has(code);
}

export function isKeyPressed(state: InputState, code: string): boolean {
  return state.keys.pressed.has(code);
}

export function isKeyReleased(state: InputState, code: string): boolean {
  return state.keys.released.has(code);
}
