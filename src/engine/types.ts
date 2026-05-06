import type { World } from 'bitecs';
import type { TimeState } from './time/time.types.ts';
import type { SceneManagerState } from './scene/scene.types.ts';
import type { LayoutRoot } from './layout/layout.types.ts';
import type { RendererState } from './renderer/renderer.types.ts';
import type { InputState } from './input/input.types.ts';
import type { CameraState } from './camera/camera.types.ts';
import type { AudioState } from './audio/audio.types.ts';
import type { AssetState } from './assets/assets.types.ts';
import type { UIState } from './ui/ui.types.ts';
import type { GUIState } from './gui/gui.types.ts';
import type { ParticleSystemState } from './particles/particles.types.ts';

export interface GameWorldContext {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  time: TimeState;
  scenes: SceneManagerState;
  layout: LayoutRoot;
  renderer: RendererState;
  input: InputState;
  camera: CameraState;
  audio: AudioState;
  assets: AssetState;
  ui: UIState;
  gui: GUIState;
  particles: ParticleSystemState;
}

export type GameWorld = World<GameWorldContext>;
