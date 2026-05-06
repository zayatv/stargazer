export {
  type UIState,
  type NodeInteraction,
  type NodeInteractionConfig,
  InteractionState,
} from './ui.types.ts';

export {
  createUIState,
  registerInteraction,
  unregisterInteraction,
  setInteractionEnabled,
  getInteractionState,
  uiSystem,
} from './ui.ts';

export {
  createUIButton,
  BUTTON_CLICK_SOUND,
  type ButtonOptions,
  type ButtonHandle,
  type ButtonDraw,
} from './button.ts';
