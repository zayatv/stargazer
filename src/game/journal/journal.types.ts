import type { LayoutNode } from '../../engine/layout/layout.types.ts';
import type { SavedPhoto } from '../photo/photo.types.ts';

export type JournalMode = 'opening' | 'reading' | 'flipping' | 'closing';

export const PHOTOS_PER_PAGE = 2;
export const PHOTOS_PER_SPREAD = PHOTOS_PER_PAGE * 2;

export interface BookGeometry {
  bookX: number;
  bookY: number;
  bookW: number;
  bookH: number;
  pageW: number;
  pageH: number;
  spineX: number;
  leftPageX: number;
  rightPageX: number;
  pageY: number;
  pagesPerView: 1 | 2;
}

export interface JournalState {
  mode: JournalMode;
  photos: SavedPhoto[];
  spreadCount: number;
  spreadIndex: number;
  geometry: BookGeometry;
  entryProgress: number;
  flipProgress: number;
  flipDirection: -1 | 0 | 1;
  flipFromIndex: number;
  flipToIndex: number;
  portraitSide: 'left' | 'right';
  uiNodes: LayoutNode[];
  tweens: Array<{ stop: () => void }>;
  leftPageNode: LayoutNode | null;
  rightPageNode: LayoutNode | null;
  leafNode: LayoutNode | null;
  prevEdgeNode: LayoutNode | null;
  nextEdgeNode: LayoutNode | null;
  closeBtnNode: LayoutNode | null;
  absorberNode: LayoutNode | null;
}
