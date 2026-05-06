import './style.css';
import { createWorld, pipe } from 'bitecs';
import type { GameWorldContext } from './engine/types.ts';
import { createTimeState, timeSystem } from './engine/time/index.ts';
import { createSceneManager, registerScene, loadScene, sceneSystem } from './engine/scene/index.ts';
import { createLayoutRoot, solveLayout, markDirtySubtree } from './engine/layout/index.ts';
import { createRenderer, flush } from './engine/renderer/index.ts';
import { createParticleState, particleSystem } from './engine/particles/index.ts';
import { createInputState, attachInputListeners, inputSystem } from './engine/input/index.ts';
import { createCameraState, cameraSystem } from './engine/camera/index.ts';
import { createAudioState, audioSystem, registerSound, VolumeGroup } from './engine/audio/index.ts';
import { createAssetState } from './engine/assets/index.ts';
import { createUIState, uiSystem, BUTTON_CLICK_SOUND } from './engine/ui/index.ts';
import { createGUIState } from './engine/gui/index.ts';
import { movementSystem, ecsRenderSystem, trailSystem } from './engine/ecs/index.ts';

import { verandaScene } from './game/scenes/veranda.scene.ts';
import { nightSkyScene } from './game/scenes/nightsky.scene.ts';
import { journalScene } from './game/journal/index.ts';
import { inspectScene } from './game/inspect/index.ts';
import { initCursorFx, cursorFxSystem } from './game/cursor-fx.ts';

function bootstrap(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  const inputState = createInputState();
  const context: GameWorldContext = {
    ctx,
    canvas,
    time: createTimeState(),
    scenes: createSceneManager(),
    layout: createLayoutRoot(canvas.clientWidth, canvas.clientHeight),
    renderer: createRenderer(),
    input: inputState,
    camera: createCameraState(),
    audio: createAudioState(),
    assets: createAssetState(),
    ui: createUIState(),
    gui: createGUIState(),
    particles: createParticleState(),
  };

  context.layout._ctx = ctx;

  const world = createWorld<GameWorldContext>(context);

  attachInputListeners(canvas, inputState);

  registerSound(world.audio, BUTTON_CLICK_SOUND, {
    src: ['/audio/sfx/sfx_ui_button_click.mp3'],
    loop: false,
    volume: 0.6,
    group: VolumeGroup.SFX,
  });

  registerSound(world.audio, 'scene-transition', {
    src: ['/audio/sfx/sfx_transition.wav'],
    loop: false,
    volume: 0.1,
    group: VolumeGroup.SFX,
  });

  function resize(): void {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const root = world.layout.root;

    root.widthValue = canvas.clientWidth;
    root.heightValue = canvas.clientHeight;

    const nextOrientation = canvas.clientWidth < canvas.clientHeight ? 'portrait' : 'landscape';
    if (nextOrientation !== world.layout.orientation) {
      world.layout.orientation = nextOrientation;
      world.layout.orientationChanged = true;
    }

    markDirtySubtree(root);

    world.layout.dirty = true;
  }

  window.addEventListener('resize', resize);

  resize();

  registerScene(world, verandaScene);
  registerScene(world, nightSkyScene);
  registerScene(world, journalScene);
  registerScene(world, inspectScene);

  initCursorFx(world);

  const enginePipeline = pipe(
    inputSystem, timeSystem, audioSystem, sceneSystem, uiSystem,
    movementSystem, trailSystem, cursorFxSystem, particleSystem, ecsRenderSystem, cameraSystem,
  );

  function loop(): void {
    enginePipeline(world);

    world.gui._tweenGroup.update();

    solveLayout(world.layout);

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    flush(world);

    world.layout.orientationChanged = false;

    requestAnimationFrame(loop);
  }

  loadScene(world, 'Veranda');
  requestAnimationFrame(loop);
}

bootstrap();
