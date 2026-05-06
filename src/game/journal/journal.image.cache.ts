import type { SavedPhoto } from '../photo/photo.types.ts';
import { PHOTOS_PER_SPREAD } from './journal.types.ts';

const cache = new Map<string, HTMLImageElement>();

export function getOrCreateImage(photo: SavedPhoto): HTMLImageElement {
  const cached = cache.get(photo.id);

  if (cached) return cached;

  const img = new Image();

  img.src = photo.pngDataUrl;

  cache.set(photo.id, img);

  return img;
}

export function prefetchSpread(photos: SavedPhoto[], spreadIndex: number): void {
  if (spreadIndex < 1) return;

  const startPhoto = (spreadIndex - 1) * PHOTOS_PER_SPREAD;

  for (let i = 0; i < PHOTOS_PER_SPREAD; i++) {
    const p = photos[startPhoto + i];

    if (p) getOrCreateImage(p);
  }
}

export function prefetchAround(photos: SavedPhoto[], spreadIndex: number): void {
  prefetchSpread(photos, spreadIndex - 1);
  prefetchSpread(photos, spreadIndex);
  prefetchSpread(photos, spreadIndex + 1);
}

export function clearImageCache(): void {
  cache.clear();
}
