import { Tween, Easing } from '@tweenjs/tween.js';
import type { GameWorld } from '../../engine/types.ts';
import { setNodeVisible } from '../../engine/layout/index.ts';
import { destroyGUINode } from '../../engine/gui/index.ts';
import { isPhotoModeActive } from '../photo/index.ts';
import { loadPhotos, revokePhotoUrls } from '../photo/photo.storage.ts';
import type { JournalState } from './journal.types.ts';
import { PHOTOS_PER_SPREAD } from './journal.types.ts';
import {
  buildBookOverlay,
  computeBookGeometry,
  applyGeometryToNodes,
} from './journal.ui.book.ts';
import {
  buildJournalButton,
  type JournalButtonHandle,
} from './journal.ui.button.ts';
import { disposeJournalOverlay } from './journal.ui.panels.ts';
import { prefetchAround, clearImageCache } from './journal.image.cache.ts';
import {playSound, registerSound, unregisterSound, VolumeGroup} from "../../engine";

const ENTRY_MS = 280;
const EXIT_MS = 220;
const FLIP_MS = 480;

const PAGE_TURN_SOUND_KEY = 'journal-page-turn';
const PAGE_TURN_SOUND_URL = '/audio/sfx/sfx_journal_page_turn.wav'

let _state: JournalState | null = null;
let _button: JournalButtonHandle | null = null;

export function isJournalActive(): boolean {
  return _state !== null;
}

export function initJournal(world: GameWorld): void {
  if (_button) return;

  _button = buildJournalButton(
    world,
    () => !isPhotoModeActive() && _state == null,
    () => openJournal(world),
  );

  registerSound(world.audio, PAGE_TURN_SOUND_KEY, {
    src: [PAGE_TURN_SOUND_URL],
    loop: false,
    volume: 0.5,
    group: VolumeGroup.SFX,
  })
}

export function tickJournal(world: GameWorld): void {
  if (_button) {
    const available = !isPhotoModeActive() && _state == null;

    _button.setVisible(available);
    _button.setEnabled(available);
  }

  const state = _state;

  if (!state) return;

  state.geometry = computeBookGeometry(world);

  if (world.layout.orientationChanged) {
    rebuildJournalOverlay(world, state);

    return;
  }

  if (state.prevEdgeNode && state.nextEdgeNode && state.closeBtnNode && state.absorberNode) {
    applyGeometryToNodes(world, state, state.prevEdgeNode, state.nextEdgeNode, state.closeBtnNode, state.absorberNode);
  }
}

function rebuildJournalOverlay(world: GameWorld, state: JournalState): void {
  for (const t of state.tweens) {
    try {
      t.stop();
    } catch { }
  }

  state.tweens.length = 0;

  if (state.mode === 'flipping') {
    state.spreadIndex = state.flipToIndex;
    state.flipProgress = 0;
    state.flipDirection = 0;
  }

  state.mode = 'reading';
  state.entryProgress = 1;

  for (const node of state.uiNodes) {
    destroyGUINode(world, node);
  }

  state.uiNodes.length = 0;
  state.leftPageNode = null;
  state.rightPageNode = null;
  state.leafNode = null;
  state.prevEdgeNode = null;
  state.nextEdgeNode = null;
  state.closeBtnNode = null;
  state.absorberNode = null;

  state.geometry = computeBookGeometry(world);

  const handle = buildBookOverlay(
    world,
    state,
    () => closeJournal(world),
    () => flipPage(world, state, -1),
    () => flipPage(world, state, +1),
  );

  state.uiNodes.push(...handle.nodes);
  state.leftPageNode = handle.leftPage;
  state.rightPageNode = handle.rightPage;
  state.leafNode = handle.leaf;
  state.prevEdgeNode = handle.prevEdge;
  state.nextEdgeNode = handle.nextEdge;
  state.closeBtnNode = handle.closeBtn;
  state.absorberNode = handle.absorber;
}

export function disposeJournal(world: GameWorld): void {
  if (_state) hardCloseJournal(world);

  _button = null;

  disposeJournalOverlay(world);
  clearImageCache();

  unregisterSound(world.audio, PAGE_TURN_SOUND_KEY);
}

function openJournal(world: GameWorld): void {
  if (_state) return;

  const state: JournalState = {
    mode: 'opening',
    photos: [],
    spreadCount: 1,
    spreadIndex: 0,
    geometry: computeBookGeometry(world),
    entryProgress: 0,
    flipProgress: 0,
    flipDirection: 0,
    flipFromIndex: 0,
    flipToIndex: 0,
    portraitSide: 'left',
    uiNodes: [],
    tweens: [],
    leftPageNode: null,
    rightPageNode: null,
    leafNode: null,
    prevEdgeNode: null,
    nextEdgeNode: null,
    closeBtnNode: null,
    absorberNode: null,
  };

  _state = state;

  const handle = buildBookOverlay(
    world,
    state,
    () => closeJournal(world),
    () => flipPage(world, state, -1),
    () => flipPage(world, state, +1),
  );

  state.uiNodes.push(...handle.nodes);
  state.leftPageNode = handle.leftPage;
  state.rightPageNode = handle.rightPage;
  state.leafNode = handle.leaf;
  state.prevEdgeNode = handle.prevEdge;
  state.nextEdgeNode = handle.nextEdge;
  state.closeBtnNode = handle.closeBtn;
  state.absorberNode = handle.absorber;

  void loadPhotos().then((photos) => {
    if (_state !== state) {
      revokePhotoUrls(photos);

      return;
    }

    state.photos = photos;
    state.spreadCount = 1 + Math.ceil(photos.length / PHOTOS_PER_SPREAD);

    prefetchAround(state.photos, state.spreadIndex);
  }).catch((e) => {
    console.warn('[journal] failed to load photos:', e);
  });

  const entryTween = new Tween(state, world.gui._tweenGroup)
    .to({ entryProgress: 1 }, ENTRY_MS)
    .easing(Easing.Cubic.Out)
    .onComplete(() => { state.mode = 'reading'; });

  entryTween.start();
  state.tweens.push(entryTween);
}

function closeJournal(world: GameWorld): void {
  const state = _state;

  if (!state) return;
  if (state.mode === 'closing') return;

  state.mode = 'closing';

  const closeTween = new Tween(state, world.gui._tweenGroup)
    .to({ entryProgress: 0 }, EXIT_MS)
    .easing(Easing.Cubic.In)
    .onComplete(() => hardCloseJournal(world));

  closeTween.start();
  state.tweens.push(closeTween);
}

function hardCloseJournal(world: GameWorld): void {
  const state = _state;
  if (!state) return;

  for (const t of state.tweens) {
    try {
      t.stop();
    } catch { }
  }

  state.tweens.length = 0;

  for (const node of state.uiNodes) {
    destroyGUINode(world, node);
  }

  state.uiNodes.length = 0;

  revokePhotoUrls(state.photos);

  state.photos = [];

  _state = null;
}

function flipPage(world: GameWorld, state: JournalState, dir: -1 | 1): void {
  if (state.mode !== 'reading') return;

  let targetSpread = state.spreadIndex;
  let targetSide: 'left' | 'right' = state.portraitSide;

  if (state.geometry.pagesPerView === 1) {
    if (state.spreadIndex === 0) {
      if (dir === 1) {
        if (state.spreadCount <= 1) return;

        targetSpread = 1;
        targetSide = 'left';
      } else {
        return;
      }
    } else {
      if (dir === 1) {
        if (state.portraitSide === 'left') {
          targetSide = 'right';
        } else {
          if (state.spreadIndex >= state.spreadCount - 1) return;

          targetSpread = state.spreadIndex + 1;
          targetSide = 'left';
        }
      } else {
        if (state.portraitSide === 'right') {
          targetSide = 'left';
        } else {
          if (state.spreadIndex - 1 === 0) {
            targetSpread = 0;
            targetSide = 'right';
          } else {
            targetSpread = state.spreadIndex - 1;
            targetSide = 'right';
          }
        }
      }
    }
  } else {
    const t = state.spreadIndex + dir;

    if (t < 0 || t >= state.spreadCount) return;

    targetSpread = t;
  }

  state.mode = 'flipping';
  state.flipDirection = dir;
  state.flipFromIndex = state.spreadIndex;
  state.flipToIndex = targetSpread;
  state.flipProgress = 0;

  if (state.leafNode && state.geometry.pagesPerView === 2) {
    setNodeVisible(world.layout, state.leafNode, true);
  }

  prefetchAround(state.photos, targetSpread);
  playSound(world.audio, PAGE_TURN_SOUND_KEY);

  const flip = new Tween(state, world.gui._tweenGroup)
    .to({ flipProgress: 1 }, state.geometry.pagesPerView === 1 ? 240 : FLIP_MS)
    .easing(Easing.Quadratic.Out)
    .onComplete(() => {
      state.spreadIndex = state.flipToIndex;
      state.portraitSide = targetSide;
      state.flipProgress = 0;
      state.flipDirection = 0;
      state.mode = 'reading';
      if (state.leafNode) setNodeVisible(world.layout, state.leafNode, false);
    });

  if (state.geometry.pagesPerView === 1) {
    state.portraitSide = targetSide;
  }

  flip.start();

  state.tweens.push(flip);
}
