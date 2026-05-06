import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import type { CameraBounds } from '../../engine/camera/index.ts';

export type PhotoMode = 'framing' | 'capturing' | 'reveal' | 'shrink';

export type PhotoTab = 'filter' | 'frame' | 'fx';

export interface PolaroidGeometry {
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  viewportX: number;
  viewportY: number;
  viewportW: number;
  viewportH: number;
  captionH: number;
  rotationRad: number;
}

export interface PhotoCustomization {
  filterId: string;
  frameId: string;
  vignetteIntensity: number;
  grainIntensity: number;
  lightLeakId: string;
  bloomIntensity: number;
  customBorderText: string;
}

export function defaultCustomization(): PhotoCustomization {
  return {
    filterId: 'none',
    frameId: 'classic',
    vignetteIntensity: 0.0,
    grainIntensity: 0.0,
    lightLeakId: 'none',
    bloomIntensity: 0.0,
    customBorderText: '',
  };
}

export interface PhotoModeState {
  mode: PhotoMode;
  geometry: PolaroidGeometry;
  capturedPng: string | null;
  capturedImage: HTMLImageElement | null;
  capturedFilterId: string;
  customization: PhotoCustomization;
  baseCanvas: HTMLCanvasElement | null;
  baseDirty: boolean;
  composeCanvas: HTMLCanvasElement | null;
  composeDirty: boolean;
  activeTab: PhotoTab;
  draftName: string;
  draftNote: string;
  draftTags: string[];
  uiNodes: LayoutNode[];
  htmlInputs: HTMLElement[];
  trackedInputBindings: Array<{ el: HTMLElement; node: LayoutNode }>;
  saveModalOpen: boolean;
  shutterAnim: { coverProgress: number } | null;
  shutterTweens: Array<{ stop: () => void }>;
  entryProgress: number;
  postCaptureScale: number;
  postCaptureAlpha: number;
  draftSlots: { nameInput: HTMLInputElement | null; noteInput: HTMLTextAreaElement | null };
  savedCameraBounds: CameraBounds | null;
  savedBoundsApplied: boolean;
  optionsScrollY: number;
  optionsViewportRect: { x: number; y: number; w: number; h: number } | null;
  optionsContentHeight: number;
}

export interface SavedPhoto {
  id: string;
  name: string;
  note: string;
  filterId: string;
  pngDataUrl: string;
  basePngDataUrl?: string;
  takenAt: number;
  customization?: PhotoCustomization;
  tags?: string[];
  schemaVersion?: number;
  nightId?: string;
}

export interface PhotoFilter {
  id: string;
  label: string;
  cssFilter: string;
}
