import type { Category, ItemDef } from './customization.types.ts';
import rawConfig from '../../assets/customization.config.json';

interface RawConfig {
  items: ItemDef[];
}

export const CUSTOMIZATION_CONFIG: ItemDef[] = (rawConfig as RawConfig).items;

const BY_KEY = new Map<string, ItemDef>(CUSTOMIZATION_CONFIG.map(it => [`${it.category}:${it.id}`, it]));

export function findItem(category: Category, id: string): ItemDef | undefined {
  return BY_KEY.get(`${category}:${id}`);
}

export function itemsForCategory(category: Category): ItemDef[] {
  return CUSTOMIZATION_CONFIG.filter(it => it.category === category);
}

export function defaultItemIds(category: Category): string[] {
  return CUSTOMIZATION_CONFIG.filter(it => it.category === category && it.unlock.kind === 'default').map(it => it.id);
}
