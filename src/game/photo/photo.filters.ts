import type { PhotoFilter } from './photo.types.ts';
import rawConfig from '../../assets/photo.filters.json';

interface RawConfig { items: PhotoFilter[]; }

export const FILTERS: PhotoFilter[] = (rawConfig as RawConfig).items;

const FILTER_BY_ID = new Map<string, PhotoFilter>(FILTERS.map(f => [f.id, f]));

export function getFilter(id: string): PhotoFilter {
  return FILTER_BY_ID.get(id) ?? FILTERS[0];
}
