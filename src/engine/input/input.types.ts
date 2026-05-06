export const PointerPhase = {
  None: 0,
  Began: 1,
  Moved: 2,
  Ended: 3,
  Cancelled: 4,
} as const;

export type PointerPhase = (typeof PointerPhase)[keyof typeof PointerPhase];

export const GestureType = {
  None: 0,
  Tap: 1,
  Drag: 2,
  Pinch: 3,
  Rotate: 4,
} as const;

export type GestureType = (typeof GestureType)[keyof typeof GestureType];

export type PointerKind = 'mouse' | 'touch' | 'pen' | 'none';

export interface RawPointerEvent {
  pointerId: number;
  x: number;
  y: number;
  phase: PointerPhase;
  button: number;
  timeStamp: number;
  pointerType: PointerKind;
}

export interface RawWheelEvent {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

export interface RawKeyEvent {
  code: string;
  key: string;
  down: boolean;
}

export interface PointerState {
  down: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  pressed: boolean;
  released: boolean;
  pointerId: number;
  hovering: boolean;
  kind: PointerKind;
}

export interface GestureState {
  type: GestureType;
  tapped: boolean;
  tapX: number;
  tapY: number;
  dragging: boolean;
  dragDX: number;
  dragDY: number;
  zoomDelta: number;
  zoomX: number;
  zoomY: number;
  rotateDelta: number;
  rotateX: number;
  rotateY: number;
}

export interface KeyboardState {
  held: Set<string>;
  pressed: Set<string>;
  released: Set<string>;
}

export interface ActivePointer {
  startX: number;
  startY: number;
  startTime: number;
  x: number;
  y: number;
}

export interface GestureRecognizer {
  _touchCount: number;
  _activePointers: Map<number, ActivePointer>;
  _prevPinchDist: number;
  _prevPinchAngle: number;
  _dragStarted: boolean;
  _primaryId: number;
  _pinchAccum: number;
  _rotateAccum: number;
}

export interface InputConfig {
  dragThreshold: number;
  tapMaxDuration: number;
  wheelZoomSensitivity: number;
  wheelRotateSensitivity: number;
  pinchThreshold: number;
  rotateThreshold: number;
}

export interface InputListeners {
  pointerdown: (e: PointerEvent) => void;
  pointermove: (e: PointerEvent) => void;
  pointerup: (e: PointerEvent) => void;
  pointercancel: (e: PointerEvent) => void;
  pointerleave: (e: PointerEvent) => void;
  wheel: (e: WheelEvent) => void;
  keydown: (e: KeyboardEvent) => void;
  keyup: (e: KeyboardEvent) => void;
  contextmenu: (e: Event) => void;
}

export interface InputState {
  pointer: PointerState;
  gesture: GestureState;
  keys: KeyboardState;
  config: InputConfig;
  _rawPointers: RawPointerEvent[];
  _rawWheel: RawWheelEvent[];
  _rawKeys: RawKeyEvent[];
  _recognizer: GestureRecognizer;
  _listeners: InputListeners | null;
  _canvas: HTMLCanvasElement | null;
}
