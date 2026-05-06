import type { GameWorld } from '../../engine/types.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { solveLayout } from '../../engine/layout/index.ts';
import { flush } from '../../engine/renderer/index.ts';
import { SeededRandom } from '../../engine/math/seeded.random.ts';
import { Tween, Easing } from '@tweenjs/tween.js';
import type {
  PhotoModeState, PolaroidGeometry, SavedPhoto,
} from './photo.types.ts';
import { defaultCustomization } from './photo.types.ts';
import {
  ensureBaseCanvas,
  ensureComposeCanvas,
  composePolaroid,
} from './photo.compose.ts';
import { computeFrameSize } from './photo.frames.ts';
import { savePhoto, generatePhotoId } from './photo.storage.ts';
import type { CustomizationState, ItemDef, ToastHandle } from '../customization/index.ts';
import { recordPhotoSaved } from '../customization/index.ts';
import { getCurrentNight, bumpCurrentNightPhotoCount } from '../night/index.ts';
import {
  buildFramingOverlay,
  buildShutterCurtains,
  syncHtmlInputPositions,
  attachFramingHandle,
  hideFramingChrome,
  tickFramingOverlay,
} from './photo.ui.ts';

const SHUTTER_CLOSE_MS = 130;
const SHUTTER_HOLD_MS = 50;
const SHUTTER_OPEN_MS = 190;
const REVEAL_HOLD_MS = 650;
const SHRINK_MS = 600;

let _photoModeActive = false;

export function isPhotoModeActive(): boolean {
  return _photoModeActive;
}

export interface PhotoSceneContext {
  state: PhotoModeState | null;
  customizationState: CustomizationState;
  toastHandle?: ToastHandle;
  onPhotoSaved?: (newlyUnlocked: ItemDef[]) => void;
}

function computeGeometry(world: GameWorld, frameId: string, seed: number): PolaroidGeometry {
  const W = world.canvas.clientWidth;
  const H = world.canvas.clientHeight;
  const minSide = Math.min(W, H);

  const topPad = 28;
  const bottomReserve = 14 + 36 + 8 + 56 + 16 + 110 + 16;
  const maxCardH = H - topPad - bottomReserve;

  let innerViewport = Math.min(520, Math.max(180, minSide * 0.62));
  let result = computeFrameSize(frameId, innerViewport);

  if (result.cardH > maxCardH && maxCardH > 0) {
    const ratio = result.layout.viewportAspect;
    const overhead = result.layout.paddingTop + result.layout.captionH;
    const maxViewportH = maxCardH - overhead;

    if (maxViewportH > 0) {
      innerViewport = ratio >= 1 ? maxViewportH * ratio : maxViewportH;
      innerViewport = Math.max(120, innerViewport);
    }

    result = computeFrameSize(frameId, innerViewport);
  }

  const horizontalMargin = 16;

  if (result.cardW > W - horizontalMargin * 2) {
    const ratio = result.layout.viewportAspect;
    const hOverhead = result.layout.paddingLeft + result.layout.paddingRight;
    const maxViewportW = W - horizontalMargin * 2 - hOverhead;

    if (maxViewportW > 0) {
      innerViewport = ratio >= 1 ? maxViewportW : maxViewportW / ratio;
      innerViewport = Math.max(120, innerViewport);
    }

    result = computeFrameSize(frameId, innerViewport);
  }

  const { cardW, cardH, viewportW, viewportH, layout } = result;
  const cardX = Math.round((W - cardW) / 2);
  const availableH = H - bottomReserve;
  const verticalCenter = (availableH - cardH) / 2;
  const cardY = Math.max(topPad, Math.round(verticalCenter));
  const viewportX = cardX + layout.paddingLeft;
  const viewportY = cardY + layout.paddingTop;
  const rng = new SeededRandom(seed);
  const rotationDeg = rng.float(-1.2, 1.2);

  return {
    cardX, cardY, cardW, cardH,
    viewportX, viewportY, viewportW, viewportH,
    captionH: layout.captionH,
    rotationRad: (rotationDeg * Math.PI) / 180,
  };
}

export function enterPhotoMode(world: GameWorld, ctx: PhotoSceneContext): void {
  if (ctx.state) return;

  const customization = defaultCustomization();
  const geometry = computeGeometry(world, customization.frameId, Date.now() & 0x7fffffff);

  const state: PhotoModeState = {
    mode: 'framing',
    geometry,
    capturedPng: null,
    capturedImage: null,
    capturedFilterId: customization.filterId,
    customization,
    baseCanvas: null,
    baseDirty: false,
    composeCanvas: null,
    composeDirty: false,
    activeTab: 'filter',
    draftName: '',
    draftNote: '',
    draftTags: [],
    uiNodes: [],
    htmlInputs: [],
    trackedInputBindings: [],
    saveModalOpen: false,
    shutterAnim: null,
    shutterTweens: [],
    entryProgress: 0,
    postCaptureScale: 1,
    postCaptureAlpha: 1,
    draftSlots: { nameInput: null, noteInput: null },
    savedCameraBounds: world.camera.bounds,
    savedBoundsApplied: true,
    optionsScrollY: 0,
    optionsViewportRect: null,
    optionsContentHeight: 0,
  };

  applyZoomedBounds(world, state);

  ctx.state = state;
  _photoModeActive = true;

  const handle = buildFramingOverlay(world, state, ctx.customizationState,
    () => triggerShutter(world, state, ctx),
    () => exitPhotoMode(world, ctx),
    (frameLayoutChanged) => {
      if (frameLayoutChanged) {
        recomputeGeometry(world, state);
      }
    },
  );

  attachFramingHandle(state, handle);
  buildShutterCurtains(world, state);

  const entryTween = new Tween(state, world.gui._tweenGroup).to({ entryProgress: 1 }, 240).easing(Easing.Cubic.Out);

  entryTween.start();

  state.shutterTweens.push(entryTween as { stop: () => void });
}

function recomputeGeometry(world: GameWorld, state: PhotoModeState): void {
  const seedRot = state.geometry.rotationRad;

  state.geometry = computeGeometry(world, state.customization.frameId, Date.now() & 0x7fffffff);
  state.geometry.rotationRad = seedRot;
}

function rebuildFramingOverlay(world: GameWorld, state: PhotoModeState, ctx: PhotoSceneContext): void {
  for (const node of state.uiNodes) {
    destroyGUINode(world, node);
  }

  state.uiNodes.length = 0;

  for (const el of state.htmlInputs) {
    el.remove();
  }

  state.htmlInputs.length = 0;
  state.trackedInputBindings.length = 0;
  state.draftSlots.nameInput = null;
  state.draftSlots.noteInput = null;

  for (const t of state.shutterTweens) {
    try {
      t.stop();
    } catch { }
  }
  state.shutterTweens.length = 0;
  state.shutterAnim = null;
  state.entryProgress = 1;

  recomputeGeometry(world, state);

  const handle = buildFramingOverlay(world, state, ctx.customizationState,
    () => triggerShutter(world, state, ctx),
    () => exitPhotoMode(world, ctx),
    (frameLayoutChanged) => {
      if (frameLayoutChanged) {
        recomputeGeometry(world, state);
      }
    },
  );

  attachFramingHandle(state, handle);
  buildShutterCurtains(world, state);
}

export function exitPhotoMode(world: GameWorld, ctx: PhotoSceneContext): void {
  const state = ctx.state;
  if (!state) return;

  for (const t of state.shutterTweens) {
    try {
      t.stop();
    } catch { }
  }

  state.shutterTweens.length = 0;
  state.shutterAnim = null;

  if (state.savedBoundsApplied) {
    world.camera.bounds = state.savedCameraBounds;

    state.savedBoundsApplied = false;
  }

  for (const node of state.uiNodes) {
    destroyGUINode(world, node);
  }

  state.uiNodes.length = 0;

  for (const el of state.htmlInputs) {
    el.remove();
  }

  state.htmlInputs.length = 0;
  state.trackedInputBindings.length = 0;
  state.draftSlots.nameInput = null;
  state.draftSlots.noteInput = null;
  state.baseCanvas = null;
  state.composeCanvas = null;

  ctx.state = null;
  _photoModeActive = false;
}

export function updatePhotoMode(world: GameWorld, ctx: PhotoSceneContext): void {
  const state = ctx.state;

  if (!state) return;

  if (world.layout.orientationChanged && state.mode === 'framing') {
    rebuildFramingOverlay(world, state, ctx);
  }

  tickFramingOverlay(world, state);
  applyZoomedBounds(world, state);
  positionDraftInputs(state);

  if (state.trackedInputBindings.length > 0) {
    syncHtmlInputPositions(state);
  }
}

function positionDraftInputs(state: PhotoModeState): void {
  const g = state.geometry;
  const showInputs = state.mode === 'framing';
  const nameH = 36;
  const noteH = 56;
  const gap = 8;
  const nameY = g.cardY + g.cardH + 14;
  const noteY = nameY + nameH + gap;

  applyInputBox(state.draftSlots.nameInput, g.cardX, nameY, g.cardW, nameH, showInputs);
  applyInputBox(state.draftSlots.noteInput, g.cardX, noteY, g.cardW, noteH, showInputs);
}

function applyInputBox(el: HTMLElement | null, x: number, y: number, w: number, h: number, visible: boolean): void {
  if (!el) return;

  if (!visible) {
    if (el.style.display !== 'none') el.style.display = 'none';

    return;
  }

  if (el.style.display === 'none') el.style.display = '';

  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.width = `${Math.round(w)}px`;
  el.style.height = `${Math.round(h)}px`;
}

function applyZoomedBounds(world: GameWorld, state: PhotoModeState): void {
  const orig = state.savedCameraBounds;

  if (!orig) return;

  const cam = world.camera;
  const sw = world.canvas.clientWidth;
  const sh = world.canvas.clientHeight;
  const baseHalfW = (sw / cam.zoom) * 0.5;
  const baseHalfH = (sh / cam.zoom) * 0.5;
  const absCos = Math.abs(Math.cos(cam.rotation));
  const absSin = Math.abs(Math.sin(cam.rotation));
  const halfW = baseHalfW * absCos + baseHalfH * absSin;
  const halfH = baseHalfW * absSin + baseHalfH * absCos;

  cam.bounds = {
    minX: orig.minX - halfW,
    minY: orig.minY - halfH,
    maxX: orig.maxX + halfW,
    maxY: orig.maxY + halfH,
  };
}

function triggerShutter(world: GameWorld, state: PhotoModeState, ctx: PhotoSceneContext): void {
  if (state.mode !== 'framing') return;
  if (state.shutterAnim !== null) return;

  state.shutterAnim = { coverProgress: 0 };

  const group = world.gui._tweenGroup;

  const closeTween = new Tween(state.shutterAnim, group)
    .to({ coverProgress: 1 }, SHUTTER_CLOSE_MS)
    .easing(Easing.Cubic.In)
    .onComplete(() => {
      performCapture(world, state, ctx);
    });

  const openTween = new Tween(state.shutterAnim, group)
    .to({ coverProgress: 0 }, SHUTTER_OPEN_MS)
    .delay(SHUTTER_HOLD_MS)
    .easing(Easing.Cubic.Out)
    .onComplete(() => {
      const idx = state.shutterTweens.indexOf(openTween as { stop: () => void });

      if (idx !== -1) state.shutterTweens.splice(idx, 1);

      state.shutterAnim = null;
    });

  closeTween.chain(openTween);

  state.shutterTweens.push(closeTween as { stop: () => void });
  state.shutterTweens.push(openTween as { stop: () => void });

  closeTween.start();
}

function performCapture(world: GameWorld, state: PhotoModeState, ctx: PhotoSceneContext): void {
  if (state.mode !== 'framing') return;

  const dpr = window.devicePixelRatio || 1;
  const screenW = world.canvas.clientWidth;
  const screenH = world.canvas.clientHeight;
  const viewportFracW = state.geometry.viewportW / screenW;
  const viewportFracH = state.geometry.viewportH / screenH;
  const minFrac = Math.min(viewportFracW, viewportFracH);
  const idealCaptureDpr = dpr * Math.max(1, 1 / Math.max(minFrac, 0.01));
  const MAX_CAPTURE_DIM = 4096;
  const dprCapByDim = MAX_CAPTURE_DIM / Math.max(screenW, screenH);
  const captureDpr = Math.max(dpr, Math.min(idealCaptureDpr, dprCapByDim));
  const baseCanvas = ensureBaseCanvas(null, state.geometry.viewportW, state.geometry.viewportH, captureDpr);
  const composeCanvas = ensureComposeCanvas(null, state.geometry.cardW, state.geometry.cardH, captureDpr);

  const visibilityCache: boolean[] = new Array(state.uiNodes.length);

  for (let i = 0; i < state.uiNodes.length; i++) {
    visibilityCache[i] = state.uiNodes[i].visible;

    state.uiNodes[i].visible = false;
  }

  const rctx = world.ctx;
  const origCanvasW = world.canvas.width;
  const origCanvasH = world.canvas.height;
  const origTransform = rctx.getTransform();

  world.canvas.width = Math.max(1, Math.round(screenW * captureDpr));
  world.canvas.height = Math.max(1, Math.round(screenH * captureDpr));

  rctx.setTransform(captureDpr, 0, 0, captureDpr, 0, 0);

  solveLayout(world.layout);

  rctx.clearRect(0, 0, screenW, screenH);

  flush(world);

  const bctx = baseCanvas.getContext('2d');

  if (bctx) {
    bctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    bctx.drawImage(
      world.canvas,
      state.geometry.viewportX * captureDpr,
      state.geometry.viewportY * captureDpr,
      state.geometry.viewportW * captureDpr,
      state.geometry.viewportH * captureDpr,
      0, 0, baseCanvas.width, baseCanvas.height,
    );
  }

  world.canvas.width = origCanvasW;
  world.canvas.height = origCanvasH;

  rctx.setTransform(origTransform);

  for (let i = 0; i < state.uiNodes.length; i++) {
    state.uiNodes[i].visible = visibilityCache[i];
  }

  composePolaroid({
    base: baseCanvas,
    target: composeCanvas,
    customization: state.customization,
    geometry: state.geometry,
    caption: state.draftName,
    dpr: captureDpr,
  });

  state.capturedFilterId = state.customization.filterId;
  state.composeCanvas = composeCanvas;

  const saveMeta = {
    id: generatePhotoId(),
    name: state.draftName.trim() || 'Untitled',
    note: state.draftNote.trim(),
    filterId: state.customization.filterId,
    takenAt: Date.now(),
    customization: { ...state.customization },
    tags: [] as string[],
    schemaVersion: 3,
    nightId: getCurrentNight()?.id,
  };

  const newlyUnlocked = recordPhotoSaved(ctx.customizationState, state.customization);

  if (newlyUnlocked.length > 0) {
    console.log('[photo] unlocked:', newlyUnlocked.map((i) => `${i.category}:${i.id}`).join(', '));
  }

  bumpCurrentNightPhotoCount();

  ctx.onPhotoSaved?.(newlyUnlocked);

  composeCanvas.toBlob((blob) => {
    if (!blob) {
      console.warn('[photo] toBlob returned null — photo not saved');

      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const photo: SavedPhoto = { ...saveMeta, pngDataUrl: blobUrl };

    void savePhoto(photo).then((result) => {
      URL.revokeObjectURL(blobUrl);

      if (!result.ok) console.warn('[photo] save failed:', result.reason);
    });
  }, 'image/png');

  state.mode = 'reveal';

  hideFramingChrome(world, state);
  hideHtmlInputs(state);

  const group = world.gui._tweenGroup;
  const holdTween = new Tween({ t: 0 }, group)
    .to({ t: 1 }, REVEAL_HOLD_MS)
    .onComplete(() => {
      state.mode = 'shrink';

      const shrinkTween = new Tween(state, group)
        .to({ postCaptureScale: 0.05, postCaptureAlpha: 0 }, SHRINK_MS)
        .easing(Easing.Cubic.In)
        .onComplete(() => {
          exitPhotoMode(world, ctx);

          if (newlyUnlocked.length > 0 && ctx.toastHandle) {
            ctx.toastHandle.queue(newlyUnlocked);
          }
        });

      shrinkTween.start();

      state.shutterTweens.push(shrinkTween as { stop: () => void });
    });

  holdTween.start();

  state.shutterTweens.push(holdTween as { stop: () => void });
}

function hideHtmlInputs(state: PhotoModeState): void {
  for (const el of state.htmlInputs) {
    el.style.display = 'none';
  }
}