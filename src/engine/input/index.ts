export {
  type InputState,
  type InputConfig,
  type PointerState,
  type GestureState,
  type KeyboardState,
  PointerPhase,
  GestureType,
} from './input.types.ts';

export {
  createInputState,
  attachInputListeners,
  detachInputListeners,
  inputSystem,
  isKeyHeld,
  isKeyPressed,
  isKeyReleased,
} from './input.ts';
