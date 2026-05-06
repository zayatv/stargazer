export type Category = 'filter' | 'frame' | 'lightLeak' | 'feature';

export type UnlockRule =
  | { kind: 'default' }
  | { kind: 'photos'; count: number }
  | { kind: 'feature'; featureId: string; count: number }
  | { kind: 'all'; rules: UnlockRule[] }
  | { kind: 'any'; rules: UnlockRule[] };

export interface ItemDef {
  category: Category;
  id: string;
  label: string;
  unlock: UnlockRule;
  hint?: string;
}

export interface GameStats {
  photosCount: number;
  featureUsage: Record<string, number>;
}

export interface CustomizationState {
  unlocked: Record<Category, string[]>;
  stats: GameStats;
  schemaVersion: number;
}

export interface ListEntry {
  item: ItemDef;
  unlocked: boolean;
  hint: string | null;
}

export const CATEGORIES: Category[] = ['filter', 'frame', 'lightLeak', 'feature'];

export const CURRENT_SCHEMA = 1;

export function defaultStats(): GameStats {
  return {
    photosCount: 0,
    featureUsage: {},
  };
}

export function emptyUnlocked(): Record<Category, string[]> {
  return {
    filter: [],
    frame: [],
    lightLeak: [],
    feature: [],
  };
}
