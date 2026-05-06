import type { GameWorld } from '../../engine/types.ts';
import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import {
  createNode, appendChild, configureNode,
  SizeMode, Direction, Justify, Align, LayoutKind,
  setNodeVisible,
} from '../../engine/layout/index.ts';
import { registerInteraction, getInteractionState, createUIButton } from '../../engine/ui/index.ts';
import { InteractionState } from '../../engine/ui/ui.types.ts';
import type { PhotoModeState, PhotoTab } from './photo.types.ts';
import { defaultCustomization } from './photo.types.ts';
import type { CustomizationState } from '../customization/index.ts';
import { listForCategory } from '../customization/index.ts';
import { THEME } from './photo.theme.ts';
import { getFilter } from './photo.filters.ts';
import { getFrame } from './photo.frames.ts';
import { drawVignette, drawGrain, drawBloom, getLightLeak } from './photo.effects.ts';
import {
  roundRect,
  getOrCreateOverlayContainer,
  drawFrostedPanel,
  createHtmlInput,
  withOptionsClip,
  FRAMING_BACKDROP_LAYER,
  FRAMING_PREVIEW_LAYER,
  FRAMING_CHROME_LAYER,
  FRAMING_HUD_LAYER,
} from './photo.ui.panels.ts';
import {registerSound, VolumeGroup} from "../../engine";

const TAB_RAIL_WIDTH = 78;
const TAB_BUTTON_H = 70;
const TAB_GAP = 10;
const RIGHT_PANEL_WIDTH = 290;
const HUD_DOCK_H = 110;
const SHUTTER_SIZE = 88;
const SIDE_BUTTON_SIZE = 52;
const SHUTTER_SOUND_KEY = 'shutter-sound';
const SHUTTER_SOUND_URL = '/audio/sfx/sfx_nightsky_camera_shutter.mp3'

const TABS: Array<{ id: PhotoTab; label: string }> = [
  { id: 'filter', label: 'Filter' },
  { id: 'frame', label: 'Frame' },
  { id: 'fx', label: 'FX' },
];

export interface FramingHandle {
  optionsRoot: LayoutNode;
  setActiveTab: (tab: PhotoTab) => void;
  rebuildOptions: () => void;
  hideChrome: () => void;
  tick: (world: GameWorld) => void;
}

interface TabPanelRefs {
  filter: LayoutNode;
  frame: LayoutNode;
  fx: LayoutNode;
}

interface BuildContext {
  world: GameWorld;
  state: PhotoModeState;
  customizationState: CustomizationState;
  onCustomizationChanged: (changedFrameLayout: boolean) => void;
}

export function buildFramingOverlay(world: GameWorld, state: PhotoModeState, customizationState: CustomizationState, onShutter: () => void, onClose: () => void, onCustomizationChanged: (changedFrameLayout: boolean) => void): FramingHandle {
  const overlay = getOrCreateOverlayContainer(world);
  const buildCtx: BuildContext = {
    world,
    state,
    customizationState,
    onCustomizationChanged
  };

  if (!world.audio._registry.has(SHUTTER_SOUND_KEY)) {
    registerSound(world.audio, SHUTTER_SOUND_KEY, {
      src: [SHUTTER_SOUND_URL],
      loop: false,
      volume: 0.5,
      group: VolumeGroup.SFX,
    });
  }

  buildBackdrop(world, state, overlay);
  buildPreview(world, state, overlay);

  const tabRail = buildTabRail(world, state, overlay);
  const optionsRoot = buildOptionsPanelRoot(world, state, overlay);
  const tabPanels = buildAllTabPanels(buildCtx, optionsRoot);
  const dock = buildBottomDock(world, state, overlay, onShutter, onClose, () => {
    state.customization = defaultCustomization();
    onCustomizationChanged(true);
  });

  buildDraftInputs(world, state);

  applyTabVisibility(world, tabPanels, state.activeTab);

  const handle: FramingHandle = {
    optionsRoot,
    setActiveTab: (tab) => {
      state.activeTab = tab;
      state.optionsScrollY = 0;

      applyTabVisibility(world, tabPanels, tab);
    },
    rebuildOptions: () => {
      for (const k of Object.keys(tabPanels) as Array<keyof TabPanelRefs>) {
        clearChildren(world, tabPanels[k]);
      }

      const rebuilt = populateTabPanels(buildCtx, tabPanels);

      void rebuilt;

      applyTabVisibility(world, tabPanels, state.activeTab);
    },
    hideChrome: () => {
      setNodeVisible(world.layout, tabRail, false);
      setNodeVisible(world.layout, optionsRoot, false);
      setNodeVisible(world.layout, dock, false);
    },
    tick: (w) => tickOptionsPanel(w, state, optionsRoot, tabPanels),
  };

  return handle;
}

const OPTIONS_HEADER_H = 38;
const OPTIONS_BOTTOM_PAD = 14;

function tickOptionsPanel(world: GameWorld, state: PhotoModeState, optionsRoot: LayoutNode, tabPanels: TabPanelRefs): void {
  const c = optionsRoot.computed;
  const viewportX = c.absX + 16;
  const viewportY = c.absY + OPTIONS_HEADER_H;
  const viewportW = c.width - 32;
  const viewportH = c.height - OPTIONS_HEADER_H - OPTIONS_BOTTOM_PAD;

  state.optionsViewportRect = { x: viewportX, y: viewportY, w: viewportW, h: viewportH };

  const activePanel = tabPanels[state.activeTab];
  const contentH = naturalContentHeight(activePanel);

  state.optionsContentHeight = contentH;

  const ges = world.input.gesture;

  if (ges.zoomDelta !== 1) {
    const px = ges.zoomX;
    const py = ges.zoomY;

    if (px >= viewportX && px <= viewportX + viewportW && py >= viewportY && py <= viewportY + viewportH) {
      const sens = world.input.config.wheelZoomSensitivity || 0.0025;
      const dy = -Math.log(ges.zoomDelta) / sens;

      state.optionsScrollY += dy;
      ges.zoomDelta = 1;
    }
  }

  const maxScroll = Math.max(0, contentH - viewportH);

  if (state.optionsScrollY < 0) state.optionsScrollY = 0;
  else if (state.optionsScrollY > maxScroll) state.optionsScrollY = maxScroll;

  const newTop = OPTIONS_HEADER_H - state.optionsScrollY;

  for (const k of Object.keys(tabPanels) as Array<keyof TabPanelRefs>) {
    const node = tabPanels[k];

    if (node.absTop !== newTop) {
      configureNode(world.layout, node, { absTop: newTop });
    }
  }
}

function naturalContentHeight(panel: LayoutNode): number {
  let total = 0;
  let n = 0;

  for (const child of panel.children) {
    if (!child.visible) continue;

    total += child.heightValue;
    n += 1;
  }

  if (n > 1) total += panel.gap * (n - 1);

  total += panel.padding.top + panel.padding.bottom;

  return total;
}

function buildDraftInputs(world: GameWorld, state: PhotoModeState): void {
  const nameInput = createHtmlInput(
    'text',
    'Name your constellation',
    50,
    state.draftName,
    (v) => {
      state.draftName = v;
      },
    'borderless',
  );

  nameInput.style.fontSize = '22px';
  nameInput.style.textAlign = 'center';

  const noteInput = createHtmlInput(
    'textarea',
    'Attach a note (optional)',
    240,
    state.draftNote,
    (v) => {
      state.draftNote = v;
      },
  );

  document.body.appendChild(nameInput);
  document.body.appendChild(noteInput);

  if (nameInput instanceof HTMLInputElement) {
    state.draftSlots.nameInput = nameInput;
  }

  if (noteInput instanceof HTMLTextAreaElement) {
    state.draftSlots.noteInput = noteInput;
  }

  state.htmlInputs.push(nameInput, noteInput);

  void world;
}

function applyTabVisibility(world: GameWorld, panels: TabPanelRefs, active: PhotoTab): void {
  setNodeVisible(world.layout, panels.filter, active === 'filter');
  setNodeVisible(world.layout, panels.frame, active === 'frame');
  setNodeVisible(world.layout, panels.fx, active === 'fx');
}

function clearChildren(world: GameWorld, node: LayoutNode): void {
  while (node.children.length > 0) {
    const child = node.children[node.children.length - 1];

    detachAndDestroy(world, node, child);
  }
}

function detachAndDestroy(_world: GameWorld, parent: LayoutNode, child: LayoutNode): void {
  const idx = parent.children.indexOf(child);

  if (idx !== -1) parent.children.splice(idx, 1);

  child.parent = null;
  child.visible = false;
}

function buildBackdrop(world: GameWorld, state: PhotoModeState, overlay: LayoutNode): void {
  const node = createNode(world.layout, 'framing-backdrop');

  configureNode(world.layout, node, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: FRAMING_BACKDROP_LAYER,
    order: 0,
    onRender: (ctx, n) => {
      const c = n.computed;
      const W = c.width;
      const H = c.height;
      const g = state.geometry;

      if (state.mode === 'reveal' || state.mode === 'shrink') {
        const fade = state.mode === 'shrink' ? state.postCaptureAlpha : 1;

        if (fade <= 0.001) return;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.fillStyle = THEME.backdrop;
        ctx.fillRect(c.absX, c.absY, W, H);
        ctx.restore();

        return;
      }

      ctx.fillStyle = THEME.backdrop;
      ctx.fillRect(c.absX, c.absY, W, g.viewportY - c.absY);
      ctx.fillRect(c.absX, g.viewportY + g.viewportH, W, (c.absY + H) - (g.viewportY + g.viewportH));
      ctx.fillRect(c.absX, g.viewportY, g.viewportX - c.absX, g.viewportH);
      ctx.fillRect(g.viewportX + g.viewportW, g.viewportY, (c.absX + W) - (g.viewportX + g.viewportW), g.viewportH);
    },
  });

  appendChild(world.layout, overlay, node);

  state.uiNodes.push(node);
}

function buildPreview(world: GameWorld, state: PhotoModeState, overlay: LayoutNode): void {
  const node = createNode(world.layout, 'framing-preview');

  configureNode(world.layout, node, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fill,
    absLeft: 0,
    absTop: 0,
    layer: FRAMING_PREVIEW_LAYER,
    order: 0,
    onRender: (ctx) => {
      const g = state.geometry;
      const cx = g.cardX + g.cardW * 0.5;
      const cy = g.cardY + g.cardH * 0.5;

      if (state.mode === 'reveal' || state.mode === 'shrink') {
        drawCapturedPolaroid(ctx, state);

        return;
      }

      const p = clamp01(state.entryProgress);
      const c = state.customization;
      const frame = getFrame(c.frameId);
      const layout = frame.layout;

      ctx.save();
      ctx.translate(cx, cy);

      const scale = 0.96 + 0.04 * p;

      ctx.scale(scale, scale);
      ctx.rotate(g.rotationRad);
      ctx.translate(-cx, -cy);

      drawLivePolaroidViewport(ctx, world, state);

      ctx.save();
      ctx.shadowColor = 'rgba(0,4,18,0.65)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;
      ctx.fillStyle = layout.paperColor;
      ctx.beginPath();
      roundRect(ctx, g.cardX, g.cardY, g.cardW, g.cardH, layout.borderRadius);
      ctx.rect(g.viewportX, g.viewportY, g.viewportW, g.viewportH);
      ctx.fill('evenodd');
      ctx.restore();

      if (frame.drawDecorations) {
        frame.drawDecorations(ctx, g.cardX, g.cardY, g.cardW, g.cardH, layout);
      }

      drawCaptionText(ctx, state);

      ctx.restore();
    },
  });

  appendChild(world.layout, overlay, node);

  state.uiNodes.push(node);
}

function drawCapturedPolaroid(ctx: CanvasRenderingContext2D, state: PhotoModeState): void {
  const source = state.composeCanvas ?? (state.capturedImage && state.capturedImage.complete && state.capturedImage.naturalWidth > 0 ? state.capturedImage : null);

  if (!source) return;

  const g = state.geometry;
  const cx = g.cardX + g.cardW * 0.5;
  const cy = g.cardY + g.cardH * 0.5;
  const scale = state.postCaptureScale;
  const alpha = state.postCaptureAlpha;

  if (scale <= 0.001 || alpha <= 0.001) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.rotate(g.rotationRad);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,4,18,0.7)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(source, g.cardX, g.cardY, g.cardW, g.cardH);
  ctx.restore();
}

function drawLivePolaroidViewport(ctx: CanvasRenderingContext2D, world: GameWorld, state: PhotoModeState): void {
  const g = state.geometry;
  const dpr = window.devicePixelRatio || 1;
  const c = state.customization;
  const filter = getFilter(c.filterId).cssFilter;

  ctx.save();
  ctx.beginPath();
  ctx.rect(g.viewportX, g.viewportY, g.viewportW, g.viewportH);
  ctx.clip();

  ctx.filter = filter || 'none';
  ctx.drawImage(world.canvas, g.viewportX * dpr, g.viewportY * dpr, g.viewportW * dpr, g.viewportH * dpr, g.viewportX, g.viewportY, g.viewportW, g.viewportH);
  ctx.filter = 'none';

  if (c.bloomIntensity > 0.001) {
    drawBloom(
      ctx, world.canvas as unknown as HTMLCanvasElement,
      g.viewportX * dpr, g.viewportY * dpr, g.viewportW * dpr, g.viewportH * dpr,
      g.viewportX, g.viewportY, g.viewportW, g.viewportH,
      c.bloomIntensity
    );
  }

  const leak = getLightLeak(c.lightLeakId);

  leak.draw(ctx, g.viewportX, g.viewportY, g.viewportW, g.viewportH);

  drawVignette(ctx, g.viewportX, g.viewportY, g.viewportW, g.viewportH, c.vignetteIntensity);
  drawGrain(ctx, g.viewportX, g.viewportY, g.viewportW, g.viewportH, c.grainIntensity, 1);

  ctx.restore();
}

function drawCaptionText(ctx: CanvasRenderingContext2D, state: PhotoModeState): void {
  const g = state.geometry;
  const c = state.customization;
  const frame = getFrame(c.frameId);
  const layout = frame.layout;

  if (layout.captionH <= 4) return;

  const fontFamily = THEME.fontSerif;
  const captionY = g.cardY + g.cardH - layout.captionH;
  const cx = g.cardX + g.cardW * 0.5;

  const lines: string[] = [];
  const main = (state.draftName || c.customBorderText || '').trim();

  if (main) lines.push(main);

  ctx.save();
  ctx.fillStyle = layout.inkColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (lines.length === 0) {
    ctx.font = `italic 14px ${fontFamily}`;
    ctx.globalAlpha = 0.45;
    ctx.fillText('', cx, captionY + layout.captionH * 0.5);
  } else if (lines.length === 1) {
    ctx.font = `${Math.min(20, layout.captionH * 0.42)}px ${fontFamily}`;
    ctx.fillText(lines[0], cx, captionY + layout.captionH * 0.5);
  } else {
    ctx.font = `${Math.min(18, layout.captionH * 0.34)}px ${fontFamily}`;
    ctx.fillText(lines[0], cx, captionY + layout.captionH * 0.36);
    ctx.font = `${Math.min(13, layout.captionH * 0.22)}px ${fontFamily}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(lines[1], cx, captionY + layout.captionH * 0.72);
  }

  ctx.restore();
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function hashString(s: string): number {
  let h = 2166136261;

  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return h >>> 0;
}

function pseudo(seed: number): number {
  let t = (seed + 0x9e3779b9) | 0;

  t ^= t >>> 16;
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;

  return (t >>> 0) / 4294967296;
}

function buildTabRail(world: GameWorld, state: PhotoModeState, overlay: LayoutNode): LayoutNode {
  const rail = createNode(world.layout, 'framing-tab-rail');
  const totalH = TABS.length * TAB_BUTTON_H + (TABS.length - 1) * TAB_GAP;

  configureNode(world.layout, rail, {
    layoutKind: LayoutKind.Flex,
    direction: Direction.Column,
    alignItems: Align.Stretch,
    gap: TAB_GAP,
    widthMode: SizeMode.Fixed,
    widthValue: TAB_RAIL_WIDTH,
    heightMode: SizeMode.Fixed,
    heightValue: totalH,
    absLeft: 16,
    absTop: Math.max(16, (window.innerHeight - totalH) * 0.5),
    layer: FRAMING_CHROME_LAYER,
    order: 0,
  });

  appendChild(world.layout, overlay, rail);

  state.uiNodes.push(rail);

  registerInteraction(world.ui, rail, {});

  for (const tab of TABS) {
    const btnHandle = createUIButton(world, {
      parent: rail,
      id: `tab-${tab.id}`,
      width: 0,
      height: TAB_BUTTON_H,
      widthMode: SizeMode.Fill,
      layer: FRAMING_CHROME_LAYER,
      order: 0,
      draw: (ctx, n) => drawTabButton(ctx, n, tab.id, tab.label, state),
      onTap: () => {
        if (state.activeTab !== tab.id) {
          const handle = (state as PhotoModeState & { _framingHandle?: FramingHandle })._framingHandle;

          if (handle) handle.setActiveTab(tab.id);
          else state.activeTab = tab.id;
        }
      },
    });

    state.uiNodes.push(btnHandle.node);
  }

  return rail;
}


function drawTabButton(ctx: CanvasRenderingContext2D, n: LayoutNode, tabId: PhotoTab, label: string, state: PhotoModeState): void {
  const c = n.computed;
  const active = state.activeTab === tabId;

  drawFrostedPanel(ctx, c.absX, c.absY, c.width, c.height, { highlighted: active, radius: 12 });

  const cx = c.absX + c.width * 0.5;
  const iconCy = c.absY + c.height * 0.42;
  const iconR = Math.min(c.width, c.height) * 0.22;

  drawTabIcon(ctx, tabId, cx, iconCy, iconR, active);

  ctx.fillStyle = active ? THEME.accent : THEME.textMuted;
  ctx.font = `${active ? 600 : 500} 11px ${THEME.fontSans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, c.absY + c.height - 14);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function roundedFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();

  roundRect(ctx, x, y, w, h, r);

  ctx.fill();
}

function drawTabIcon(ctx: CanvasRenderingContext2D, tabId: PhotoTab, cx: number, cy: number, r: number, active: boolean): void {
  const stroke = active ? THEME.accent : THEME.textMuted;
  const fill = active ? THEME.accent : THEME.textMuted;

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 1.5;

  switch (tabId) {
    case 'filter': {
      const hues = ['#e8c98a', '#a0c4e3', '#caa5d0', '#a8d2a8'];
      const start = -Math.PI / 2;

      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = hues[i];
        ctx.globalAlpha = active ? 0.95 : 0.7;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start + i * (Math.PI / 2), start + (i + 1) * (Math.PI / 2));
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = THEME.bg;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
      ctx.fill();

      break;
    }
    case 'frame': {
      ctx.strokeRect(cx - r, cy - r * 0.85, r * 2, r * 1.7);
      ctx.strokeStyle = active ? THEME.accent : THEME.textMuted;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cx - r * 0.7, cy - r * 0.55, r * 1.4, r * 0.75);
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.55, r * 0.12, 0, Math.PI * 2);
      ctx.fill();

      break;
    }
    case 'fx': {
      const arms = 6;

      ctx.beginPath();

      for (let i = 0; i < arms; i++) {
        const a = (i * Math.PI) / (arms / 2);
        const inner = r * 0.25;

        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }

      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function buildOptionsPanelRoot(world: GameWorld, state: PhotoModeState, overlay: LayoutNode): LayoutNode {
  const root = createNode(world.layout, 'framing-options-root');
  const padding = { top: 0, right: 16, bottom: 0, left: 16 };

  configureNode(world.layout, root, {
    layoutKind: LayoutKind.Absolute,
    widthMode: SizeMode.Fixed,
    widthValue: RIGHT_PANEL_WIDTH,
    heightMode: SizeMode.Fixed,
    heightValue: 460,
    absRight: 16,
    absTop: Math.max(40, (window.innerHeight - 460) * 0.5),
    padding,
    layer: FRAMING_CHROME_LAYER,
    order: 0,
    onRender: (ctx, n) => {
      const c = n.computed;

      drawFrostedPanel(ctx, c.absX, c.absY, c.width, c.height, { radius: 16 });

      ctx.fillStyle = THEME.textMuted;
      ctx.font = `600 11px ${THEME.fontSans}`;
      ctx.textBaseline = 'top';
      ctx.fillText('OPTIONS', c.absX + 18, c.absY + 14);
    },
  });

  appendChild(world.layout, overlay, root);

  state.uiNodes.push(root);

  registerInteraction(world.ui, root, {});

  return root;
}

function buildAllTabPanels(buildCtx: BuildContext, parent: LayoutNode): TabPanelRefs {
  const { world } = buildCtx;
  const filterPanel = createPanelHost(world, parent, 'panel-filter');
  const framePanel = createPanelHost(world, parent, 'panel-frame');
  const fxPanel = createPanelHost(world, parent, 'panel-fx');
  const stampPanel = createPanelHost(world, parent, 'panel-stamp');
  const textPanel = createPanelHost(world, parent, 'panel-text');

  const refs: TabPanelRefs = {
    filter: filterPanel,
    frame: framePanel,
    fx: fxPanel
  };

  buildCtx.state.uiNodes.push(filterPanel, framePanel, fxPanel, stampPanel, textPanel);

  populateTabPanels(buildCtx, refs);

  return refs;
}

function createPanelHost(world: GameWorld, parent: LayoutNode, name: string): LayoutNode {
  const n = createNode(world.layout, name);

  configureNode(world.layout, n, {
    layoutKind: LayoutKind.Flex,
    direction: Direction.Column,
    alignItems: Align.Stretch,
    gap: 10,
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.FitContent,
    absTop: 38,
    layer: FRAMING_CHROME_LAYER + 1,
    order: 0,
  });

  appendChild(world.layout, parent, n);

  return n;
}

function populateTabPanels(buildCtx: BuildContext, refs: TabPanelRefs): void {
  buildFilterPanel(buildCtx, refs.filter);
  buildFramePanel(buildCtx, refs.frame);
  buildFxPanel(buildCtx, refs.fx);
  applyPanelChildClip(buildCtx.state, refs);
}

function applyPanelChildClip(state: PhotoModeState, panels: TabPanelRefs): void {
  for (const k of Object.keys(panels) as Array<keyof TabPanelRefs>) {
    const panel = panels[k];

    for (const child of panel.children) {
      child.flexShrink = 0;
    }

    wrapRendererTree(state, panel);
  }
}

function wrapRendererTree(state: PhotoModeState, node: LayoutNode): void {
  for (const child of node.children) {
    if (child.onRender !== null) {
      child.onRender = withOptionsClip(state, child.onRender);
    }

    wrapRendererTree(state, child);
  }
}

function buildFilterPanel(buildCtx: BuildContext, parent: LayoutNode): void {
  const { world, state, customizationState, onCustomizationChanged } = buildCtx;
  const entries = listForCategory(customizationState, 'filter');

  for (const entry of entries) {
    const filter = getFilter(entry.item.id);

    createUIButton(world, {
      parent,
      id: `filter-row-${entry.item.id}`,
      width: 0,
      height: 64,
      widthMode: SizeMode.Fill,
      layer: FRAMING_CHROME_LAYER + 2,
      order: 0,
      isEnabled: () => entry.unlocked,
      draw: (ctx, n) => {
        const c = n.computed;
        const selected = entry.unlocked && state.customization.filterId === entry.item.id;
        const interaction = getInteractionState(world.ui, n);

        drawRowBackground(ctx, c.absX, c.absY, c.width, c.height, selected, interaction, !entry.unlocked);

        ctx.save();

        if (!entry.unlocked) ctx.globalAlpha = 0.45;

        const thumbSize = 48;
        const thumbX = c.absX + 8;
        const thumbY = c.absY + (c.height - thumbSize) * 0.5;

        ctx.save();
        ctx.beginPath();
        roundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 6);
        ctx.clip();
        ctx.fillStyle = '#040814';
        ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);

        const dpr = window.devicePixelRatio || 1;
        const g = state.geometry;

        ctx.filter = entry.unlocked ? (filter.cssFilter || 'none') : 'grayscale(1)';
        ctx.drawImage(
          world.canvas,
          g.viewportX * dpr, g.viewportY * dpr, g.viewportW * dpr, g.viewportH * dpr,
          thumbX, thumbY, thumbSize, thumbSize,
        );
        ctx.filter = 'none';
        ctx.restore();
        ctx.strokeStyle = selected ? THEME.accent : 'rgba(255,255,255,0.08)';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.beginPath();
        roundRect(ctx, thumbX + 0.5, thumbY + 0.5, thumbSize - 1, thumbSize - 1, 6);
        ctx.stroke();

        ctx.fillStyle = selected ? THEME.textPrimary : THEME.textMuted;
        ctx.font = `${selected ? 600 : 500} 14px ${THEME.fontSans}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.item.label, thumbX + thumbSize + 12, c.absY + c.height * 0.5);

        ctx.restore();

        if (selected) {
          drawCheckMark(ctx, c.absX + c.width - 22, c.absY + c.height * 0.5, 7);
        } else if (!entry.unlocked && entry.hint) {
          drawLockHint(ctx, c.absX + c.width - 8, c.absY + c.height * 0.5, entry.hint);
        }
      },
      onTap: () => {
        if (!entry.unlocked) return;

        if (state.customization.filterId === entry.item.id) return;

        state.customization.filterId = entry.item.id;
        state.capturedFilterId = entry.item.id;

        onCustomizationChanged(false);
      },
    });
  }
}

function buildFramePanel(buildCtx: BuildContext, parent: LayoutNode): void {
  const { world, state, customizationState, onCustomizationChanged } = buildCtx;
  const entries = listForCategory(customizationState, 'frame');

  for (const entry of entries) {
    createUIButton(world, {
      parent,
      id: `frame-row-${entry.item.id}`,
      width: 0,
      height: 64,
      widthMode: SizeMode.Fill,
      layer: FRAMING_CHROME_LAYER + 2,
      order: 0,
      isEnabled: () => entry.unlocked,
      draw: (ctx, n) => {
        const c = n.computed;
        const selected = entry.unlocked && state.customization.frameId === entry.item.id;
        const interaction = getInteractionState(world.ui, n);

        drawRowBackground(ctx, c.absX, c.absY, c.width, c.height, selected, interaction, !entry.unlocked);

        ctx.save();

        if (!entry.unlocked) ctx.globalAlpha = 0.45;

        const thumbSize = 48;
        const thumbX = c.absX + 8;
        const thumbY = c.absY + (c.height - thumbSize) * 0.5;

        drawFrameThumb(ctx, thumbX, thumbY, thumbSize, thumbSize, entry.item.id);

        ctx.fillStyle = selected ? THEME.textPrimary : THEME.textMuted;
        ctx.font = `${selected ? 600 : 500} 14px ${THEME.fontSans}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.item.label, thumbX + thumbSize + 12, c.absY + c.height * 0.5);

        ctx.restore();

        if (selected) {
          drawCheckMark(ctx, c.absX + c.width - 22, c.absY + c.height * 0.5, 7);
        } else if (!entry.unlocked && entry.hint) {
          drawLockHint(ctx, c.absX + c.width - 8, c.absY + c.height * 0.5, entry.hint);
        }
      },
      onTap: () => {
        if (!entry.unlocked) return;

        if (state.customization.frameId === entry.item.id) return;

        state.customization.frameId = entry.item.id;

        onCustomizationChanged(true);
      },
    });
  }
}

function drawFrameThumb(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frameId: string): void {
  const frame = getFrame(frameId);
  const layout = frame.layout;

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 4);
  ctx.clip();
  ctx.fillStyle = layout.paperColor;
  ctx.fillRect(x, y, w, h);

  const sidePad = w * 0.14;
  const topPad = h * 0.14;
  const cap = h * (layout.captionH > 4 ? Math.min(0.28, layout.captionH / 200) : 0);
  const innerW = w - sidePad * 2;
  const innerH = h - topPad - cap;

  ctx.fillStyle = '#1a2438';
  ctx.fillRect(x + sidePad, y + topPad, innerW, innerH);
  ctx.fillStyle = 'rgba(232,201,138,0.85)';

  const seed = hashString(frameId);

  for (let i = 0; i < 4; i++) {
    const sx = x + sidePad + pseudo(seed + i * 3) * innerW;
    const sy = y + topPad + pseudo(seed + i * 3 + 1) * innerH;

    ctx.beginPath();
    ctx.arc(sx, sy, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4);
  ctx.stroke();
}

function buildFxPanel(buildCtx: BuildContext, parent: LayoutNode): void {
  const { world, state, customizationState, onCustomizationChanged } = buildCtx;
  const featureEntries = listForCategory(customizationState, 'feature');
  const featureLookup = new Map(featureEntries.map(e => [e.item.id, e]));
  const vignetteEntry = featureLookup.get('vignette');
  const grainEntry = featureLookup.get('grain');
  const bloomEntry = featureLookup.get('bloom');

  buildSlider(world, parent, state, 'Vignette',
    vignetteEntry?.unlocked ?? true, vignetteEntry?.hint ?? null,
    () => state.customization.vignetteIntensity,
    (v) => {
    state.customization.vignetteIntensity = v;
    onCustomizationChanged(false);
  });

  buildSlider(world, parent, state, 'Grain',
    grainEntry?.unlocked ?? true, grainEntry?.hint ?? null,
    () => state.customization.grainIntensity,
    (v) => {
    state.customization.grainIntensity = v;
    onCustomizationChanged(false);
  });

  buildSlider(world, parent, state, 'Bloom',
    bloomEntry?.unlocked ?? true, bloomEntry?.hint ?? null,
    () => state.customization.bloomIntensity,
    (v) => {
    state.customization.bloomIntensity = v;
    onCustomizationChanged(false);
  });

  const leakLabel = createNode(world.layout, 'leak-label');

  configureNode(world.layout, leakLabel, {
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fixed,
    heightValue: 18,
    layer: FRAMING_CHROME_LAYER + 2,
    order: 0,
    onRender: (ctx, n) => {
      const c = n.computed;

      ctx.fillStyle = THEME.textMuted;
      ctx.font = `600 11px ${THEME.fontSans}`;
      ctx.textBaseline = 'top';
      ctx.fillText('LIGHT LEAK', c.absX, c.absY + 4);
    },
  });

  appendChild(world.layout, parent, leakLabel);

  const leakEntries = listForCategory(customizationState, 'lightLeak');

  for (const entry of leakEntries) {
    createUIButton(world, {
      parent,
      id: `leak-${entry.item.id}`,
      width: 0,
      height: 38,
      widthMode: SizeMode.Fill,
      layer: FRAMING_CHROME_LAYER + 2,
      order: 0,
      isEnabled: () => entry.unlocked,
      draw: (ctx, n) => {
        const c = n.computed;
        const selected = entry.unlocked && state.customization.lightLeakId === entry.item.id;
        const interaction = getInteractionState(world.ui, n);

        drawRowBackground(ctx, c.absX, c.absY, c.width, c.height, selected, interaction, !entry.unlocked);

        ctx.save();

        if (!entry.unlocked) ctx.globalAlpha = 0.45;

        const dotX = c.absX + 14;
        const dotY = c.absY + c.height * 0.5;

        ctx.strokeStyle = selected ? THEME.accent : THEME.textFaint;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
        ctx.stroke();

        if (selected) {
          ctx.fillStyle = THEME.accent;
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = selected ? THEME.textPrimary : THEME.textMuted;
        ctx.font = `${selected ? 600 : 500} 13px ${THEME.fontSans}`;
        ctx.textBaseline = 'middle';
        ctx.fillText(entry.item.label, dotX + 16, dotY);

        ctx.restore();

        if (!entry.unlocked && entry.hint) {
          drawLockHint(ctx, c.absX + c.width - 8, c.absY + c.height * 0.5, entry.hint);
        }
      },
      onTap: () => {
        if (!entry.unlocked) return;

        if (state.customization.lightLeakId === entry.item.id) return;

        state.customization.lightLeakId = entry.item.id;

        onCustomizationChanged(false);
      },
    });
  }
}

function buildSlider(world: GameWorld, parent: LayoutNode, state: PhotoModeState, label: string, unlocked: boolean, hint: string | null, get: () => number, set: (v: number) => void): void {
  const wrapper = createNode(world.layout, `slider-${label}`);

  configureNode(world.layout, wrapper, {
    widthMode: SizeMode.Fill,
    heightMode: SizeMode.Fixed,
    heightValue: 44,
    layer: FRAMING_CHROME_LAYER + 2,
    order: 0,
    onRender: (ctx, n) => {
      const c = n.computed;

      ctx.save();

      if (!unlocked) ctx.globalAlpha = 0.45;

      ctx.fillStyle = THEME.textMuted;
      ctx.font = `600 11px ${THEME.fontSans}`;
      ctx.textBaseline = 'top';
      ctx.fillText(label.toUpperCase(), c.absX, c.absY);

      const KNOB_R = 7;
      const trackX = c.absX + KNOB_R;
      const trackW = c.width - KNOB_R * 2;

      if (unlocked) {
        const v = Math.max(0, Math.min(1, get()));

        ctx.fillStyle = THEME.textPrimary;
        ctx.font = `500 12px ${THEME.fontSans}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(v * 100)}`, c.absX + c.width, c.absY);
        ctx.textAlign = 'start';

        const trackY = c.absY + 28;
        const trackH = 6;

        ctx.fillStyle = 'rgba(255,255,255,0.08)';

        roundedFill(ctx, trackX, trackY, trackW, trackH, 3);

        const fillW = trackW * v;

        ctx.fillStyle = THEME.accent;

        roundedFill(ctx, trackX, trackY, fillW, trackH, 3);

        const knobX = trackX + fillW;
        const knobY = trackY + trackH * 0.5;

        ctx.fillStyle = THEME.accent;
        ctx.beginPath();
        ctx.arc(knobX, knobY, KNOB_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = THEME.bg;
        ctx.beginPath();
        ctx.arc(knobX, knobY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const trackY = c.absY + 28;
        const trackH = 6;

        ctx.fillStyle = 'rgba(255,255,255,0.06)';

        roundedFill(ctx, trackX, trackY, trackW, trackH, 3);
      }

      ctx.restore();

      if (!unlocked && hint) {
        ctx.save();
        ctx.fillStyle = THEME.textFaint;
        ctx.font = `500 11px ${THEME.fontSans}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'right';
        ctx.fillText(hint, c.absX + c.width, c.absY);
        ctx.textAlign = 'start';
        ctx.restore();
      }
    },
  });

  const KNOB_R = 7;

  appendChild(world.layout, parent, wrapper);

  registerInteraction(world.ui, wrapper, {
    onPointerDown: (n) => {
      if (!unlocked) return;

      const c = n.computed;
      const trackX = c.absX + KNOB_R;
      const trackW = Math.max(1, c.width - KNOB_R * 2);
      const x = worldPointerX(world) - trackX;
      const v = Math.max(0, Math.min(1, x / trackW));

      set(v);
    },
    onDrag: (n) => {
      if (!unlocked) return;

      const c = n.computed;
      const trackX = c.absX + KNOB_R;
      const trackW = Math.max(1, c.width - KNOB_R * 2);
      const x = worldPointerX(world) - trackX;
      const v = Math.max(0, Math.min(1, x / trackW));

      set(v);
    },
  });
  void state;
}

function worldPointerX(world: GameWorld): number {
  return world.input.pointer.x;
}

function buildBottomDock(world: GameWorld, state: PhotoModeState, overlay: LayoutNode, onShutter: () => void, onClose: () => void, onReset: () => void): LayoutNode {
  const dock = createNode(world.layout, 'framing-dock');
  const dockTargetW = Math.min(320, Math.max(220, window.innerWidth - 32));
  const dockGap = window.innerWidth < 360 ? 24 : 36;

  configureNode(world.layout, dock, {
    layoutKind: LayoutKind.Flex,
    direction: Direction.Row,
    alignItems: Align.Center,
    justify: Justify.Center,
    gap: dockGap,
    widthMode: SizeMode.Fixed,
    widthValue: dockTargetW,
    heightMode: SizeMode.Fixed,
    heightValue: HUD_DOCK_H,
    absLeft: Math.max(16, (window.innerWidth - dockTargetW) * 0.5),
    absBottom: 16,
    layer: FRAMING_HUD_LAYER,
    order: 0,
  });

  appendChild(world.layout, overlay, dock);

  state.uiNodes.push(dock);

  registerInteraction(world.ui, dock, {});

  const closeHandle = createUIButton(world, {
    parent: dock,
    id: 'framing-close',
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    layer: FRAMING_HUD_LAYER,
    order: 0,
    draw: (ctx, n, w) => drawCircleButton(ctx, n, w, 'close'),
    onTap: onClose,
  });

  state.uiNodes.push(closeHandle.node);

  const shutterHandle = createUIButton(world, {
    parent: dock,
    id: 'framing-shutter',
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    layer: FRAMING_HUD_LAYER,
    order: 0,
    draw: (ctx, n, w) => drawShutterButton(ctx, n, w),
    onTap: onShutter,
    clickSoundKey: SHUTTER_SOUND_KEY
  });

  state.uiNodes.push(shutterHandle.node);

  const resetHandle = createUIButton(world, {
    parent: dock,
    id: 'framing-reset',
    width: SIDE_BUTTON_SIZE,
    height: SIDE_BUTTON_SIZE,
    layer: FRAMING_HUD_LAYER,
    order: 0,
    draw: (ctx, n, w) => drawCircleButton(ctx, n, w, 'reset'),
    onTap: onReset,
  });

  state.uiNodes.push(resetHandle.node);

  return dock;
}

function drawCircleButton(ctx: CanvasRenderingContext2D, n: LayoutNode, world: GameWorld, variant: 'close' | 'reset'): void {
  const c = n.computed;
  const cx = c.absX + c.width * 0.5;
  const cy = c.absY + c.height * 0.5;
  const r = c.width * 0.5;
  const interaction = getInteractionState(world.ui, n);

  let bg = 'rgba(20,28,46,0.78)';

  if (interaction === InteractionState.Pressed) bg = 'rgba(50,40,28,0.92)';
  else if (interaction === InteractionState.Hovered) bg = 'rgba(36,30,22,0.88)';

  ctx.save();
  ctx.shadowColor = 'rgba(0,4,18,0.45)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = THEME.panelStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = THEME.textPrimary;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  if (variant === 'close') {
    const arm = c.width * 0.22;

    ctx.beginPath();
    ctx.moveTo(cx - arm, cy - arm);
    ctx.lineTo(cx + arm, cy + arm);
    ctx.moveTo(cx + arm, cy - arm);
    ctx.lineTo(cx - arm, cy + arm);
    ctx.stroke();
  } else {
    const arm = c.width * 0.22;

    ctx.beginPath();
    ctx.arc(cx, cy, arm, Math.PI * 0.3, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = THEME.textPrimary;
    ctx.beginPath();
    ctx.moveTo(cx + arm * 1.0, cy - arm * 0.15);
    ctx.lineTo(cx + arm * 0.5, cy - arm * 0.65);
    ctx.lineTo(cx + arm * 1.5, cy - arm * 0.65);
    ctx.closePath();
    ctx.fill();
  }
}

function drawShutterButton(ctx: CanvasRenderingContext2D, n: LayoutNode, world: GameWorld): void {
  const c = n.computed;
  const cx = c.absX + c.width * 0.5;
  const cy = c.absY + c.height * 0.5;
  const r = c.width * 0.5;
  const interaction = getInteractionState(world.ui, n);
  const press = interaction === InteractionState.Pressed ? 0.93 : 1;

  ctx.save();
  ctx.shadowColor = 'rgba(0,4,18,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(20,28,46,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = THEME.accentSoft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
  ctx.stroke();

  const inner = (r - 9) * press;
  const grad = ctx.createRadialGradient(cx - inner * 0.3, cy - inner * 0.3, inner * 0.2, cx, cy, inner);

  grad.addColorStop(0, '#fff5dc');
  grad.addColorStop(1, THEME.accent);
  ctx.fillStyle = interaction === InteractionState.Pressed ? THEME.accentDeep : grad;
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, inner - 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRowBackground(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, selected: boolean, interaction: InteractionState, locked = false): void {
  let bg = 'rgba(255,255,255,0.04)';

  if (locked) bg = 'rgba(255,255,255,0.02)';
  else if (selected) bg = 'rgba(232,201,138,0.16)';
  else if (interaction === InteractionState.Hovered) bg = 'rgba(255,255,255,0.08)';
  else if (interaction === InteractionState.Pressed) bg = 'rgba(255,255,255,0.12)';

  ctx.fillStyle = bg;
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();

  if (selected && !locked) {
    ctx.strokeStyle = THEME.accentSoft;
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10);
    ctx.stroke();
  }
}

function drawLockHint(ctx: CanvasRenderingContext2D, rightX: number, centerY: number, hint: string): void {
  ctx.save();
  ctx.fillStyle = THEME.textFaint;
  ctx.font = `500 11px ${THEME.fontSans}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.fillText(hint, rightX, centerY);
  ctx.textAlign = 'start';
  ctx.restore();
}

function drawCheckMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = THEME.accent;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - size, cy);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.6);
  ctx.lineTo(cx + size, cy - size * 0.6);
  ctx.stroke();
  ctx.restore();
}

export function attachFramingHandle(state: PhotoModeState, handle: FramingHandle): void {
  (state as PhotoModeState & { _framingHandle?: FramingHandle })._framingHandle = handle;
}

