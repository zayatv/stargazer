import type { GameWorld } from '../types.ts';
import type { LayoutNode } from '../layout/layout.types.ts';
import { LayoutKind, SizeMode } from '../layout/layout.types.ts';
import { createNode, appendChild, configureNode } from '../layout/layout.tree.ts';
import { registerInteraction, setInteractionEnabled } from './ui.ts';

export const BUTTON_CLICK_SOUND = 'ui-click';

export type ButtonDraw = (ctx: CanvasRenderingContext2D, node: LayoutNode, world: GameWorld, enabled: boolean,) => void;

export interface ButtonOptions {
  parent: LayoutNode;
  id: string;
  width: number;
  height: number;
  draw: ButtonDraw;
  onTap: () => void;
  isEnabled?: () => boolean;
  layoutKind?: LayoutKind;
  widthMode?: SizeMode;
  heightMode?: SizeMode;
  absLeft?: number;
  absRight?: number;
  absTop?: number;
  absBottom?: number;
  layer?: number;
  order?: number;
  clickSoundKey?: string | null;
  onPress?: () => void;
  onHoverEnter?: () => void;
  onHoverExit?: () => void;
}

export interface ButtonHandle {
  node: LayoutNode;
  setEnabled: (enabled: boolean) => void;
  setVisible: (visible: boolean) => void;
  isEnabled: () => boolean;
}

export function createUIButton(world: GameWorld, opts: ButtonOptions): ButtonHandle {
  const node = createNode(world.layout, opts.id);
  let manualEnabled = true;
  const getEnabled = (): boolean => opts.isEnabled ? opts.isEnabled() : manualEnabled;
  const soundKey = opts.clickSoundKey === undefined ? BUTTON_CLICK_SOUND : opts.clickSoundKey;

  const config: Parameters<typeof configureNode>[2] = {
    widthMode: opts.widthMode ?? SizeMode.Fixed,
    widthValue: opts.width,
    heightMode: opts.heightMode ?? SizeMode.Fixed,
    heightValue: opts.height,
    onRender: (ctx, n) => opts.draw(ctx, n, world, getEnabled()),
  };

  if (opts.layoutKind !== undefined) config.layoutKind = opts.layoutKind;
  if (opts.absLeft !== undefined) config.absLeft = opts.absLeft;
  if (opts.absRight !== undefined) config.absRight = opts.absRight;
  if (opts.absTop !== undefined) config.absTop = opts.absTop;
  if (opts.absBottom !== undefined) config.absBottom = opts.absBottom;
  if (opts.layer !== undefined) config.layer = opts.layer;
  if (opts.order !== undefined) config.order = opts.order;

  configureNode(world.layout, node, config);
  appendChild(world.layout, opts.parent, node);

  registerInteraction(world.ui, node, {
    isEnabled: opts.isEnabled ? opts.isEnabled : (() => manualEnabled),
    clickSoundKey: soundKey ?? undefined,
    onTap: () => opts.onTap(),
    onPointerDown: opts.onPress ? () => opts.onPress!() : undefined,
    onHoverEnter: opts.onHoverEnter ? () => opts.onHoverEnter!() : undefined,
    onHoverExit: opts.onHoverExit ? () => opts.onHoverExit!() : undefined,
  });

  return {
    node,
    setEnabled: (next: boolean) => {
      if (manualEnabled === next) return;

      manualEnabled = next;

      if (!opts.isEnabled) setInteractionEnabled(world.ui, node, next);
    },
    setVisible: (visible: boolean) => {
      if (node.visible !== visible) node.visible = visible;
    },
    isEnabled: getEnabled,
  };
}
