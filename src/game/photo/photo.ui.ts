export {
  buildPhotoButton,
  type PhotoButtonHandle,
} from './photo.ui.button.ts';

export {
  disposePhotoOverlay,
  syncHtmlInputPositions,
} from './photo.ui.panels.ts';

export {
  buildFramingOverlay,
  attachFramingHandle,
  type FramingHandle,
} from './photo.ui.framing.ts';

export { buildShutterCurtains } from './photo.ui.shutter.ts';

import type { GameWorld } from '../../engine/types.ts';
import type { PhotoModeState } from './photo.types.ts';
import type { FramingHandle } from './photo.ui.framing.ts';

export function hideFramingChrome(_world: GameWorld, state: PhotoModeState): void {
  const handle = (state as PhotoModeState & { _framingHandle?: FramingHandle })._framingHandle;

  handle?.hideChrome();
}

export function tickFramingOverlay(world: GameWorld, state: PhotoModeState): void {
  const handle = (state as PhotoModeState & { _framingHandle?: FramingHandle })._framingHandle;

  handle?.tick(world);
}
