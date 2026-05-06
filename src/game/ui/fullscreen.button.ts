import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import { LayoutKind } from '../../engine/layout/layout.types.ts';
import { createUIButton, getInteractionState } from '../../engine/ui/index.ts';
import { enqueueImage, loadAll } from '../../engine/assets/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { drawAssetIconButton } from './button-style.ts';

const FULLSCREEN_ICON_KEY = 'fullscreen-icon';
const FULLSCREEN_ICON_URL = '/images/icons/icon_fullscreen.png';

export interface FullscreenButtonHandle {
  node: LayoutNode;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  destroy: (world: GameWorld) => void;
}

export function buildFullscreenButton(
  world: GameWorld,
  parent: LayoutNode,
  opts?: { layer?: number; order?: number },
): FullscreenButtonHandle {
  enqueueImage(world.assets, FULLSCREEN_ICON_KEY, FULLSCREEN_ICON_URL);
  void loadAll(world.assets);

  const handle = createUIButton(world, {
    parent,
    id: 'fullscreen-button',
    width: 60,
    height: 60,
    layoutKind: LayoutKind.Absolute,
    absLeft: 32,
    absTop: 32,
    layer: opts?.layer ?? 100,
    order: opts?.order ?? 0,
    onTap: () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void document.documentElement.requestFullscreen();
      }
    },
    draw: (ctx, n, _w, enabled) => {
      drawAssetIconButton(world, ctx, n, 0.18, enabled, FULLSCREEN_ICON_KEY, getInteractionState(world.ui, n));
    },
  });

  return {
    node: handle.node,
    setEnabled: handle.setEnabled,
    setVisible: handle.setVisible,
    destroy: (w: GameWorld) => {
      destroyGUINode(w, handle.node);
    },
  };
}
