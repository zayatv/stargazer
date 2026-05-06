import type {
  Category, ItemDef, UnlockRule, CustomizationState, ListEntry,
} from './customization.types.ts';
import {
  CATEGORIES, CURRENT_SCHEMA, defaultStats, emptyUnlocked,
} from './customization.types.ts';
import {
  CUSTOMIZATION_CONFIG, findItem, itemsForCategory, defaultItemIds,
} from './customization.config.ts';

const STORAGE_KEY = 'stargazer:customization';

export function loadCustomization(): CustomizationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === 'object' && parsed.schemaVersion >= 1) {
        return normalize(parsed);
      }
    }
  } catch { }

  const fresh = freshState();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch { }

  return fresh;
}

export function saveCustomization(state: CustomizationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { }
}

function freshState(): CustomizationState {
  const unlocked = emptyUnlocked();

  for (const cat of CATEGORIES) {
    unlocked[cat] = defaultItemIds(cat);
  }

  return { unlocked, stats: defaultStats(), schemaVersion: CURRENT_SCHEMA };
}

function normalize(raw: Partial<CustomizationState> & Record<string, unknown>): CustomizationState {
  const unlocked = emptyUnlocked();
  const rawUnlocked = (raw.unlocked ?? {}) as Partial<Record<Category, string[]>>;

  for (const cat of CATEGORIES) {
    const fromRaw = Array.isArray(rawUnlocked[cat]) ? (rawUnlocked[cat] as string[]).filter(s => typeof s === 'string') : [];
    const merged = new Set<string>(fromRaw);

    for (const id of defaultItemIds(cat)) merged.add(id);

    unlocked[cat] = [...merged];
  }

  const rawStats = (raw.stats ?? {}) as Partial<CustomizationState['stats']>;
  const stats = {
    photosCount: typeof rawStats.photosCount === 'number' ? rawStats.photosCount : 0,
    featureUsage: rawStats.featureUsage && typeof rawStats.featureUsage === 'object' ? sanitizeFeatureUsage(rawStats.featureUsage as Record<string, unknown>) : {},
  };

  return { unlocked, stats, schemaVersion: CURRENT_SCHEMA };
}

function sanitizeFeatureUsage(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};

  for (const k of Object.keys(raw)) {
    const v = raw[k];

    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }

  return out;
}

export function isUnlocked(state: CustomizationState, category: Category, id: string): boolean {
  const arr = state.unlocked[category];

  return Array.isArray(arr) && arr.includes(id);
}

export function listForCategory(state: CustomizationState, category: Category): ListEntry[] {
  const items = itemsForCategory(category);

  return items.map(item => {
    const unlocked = isUnlocked(state, category, item.id);

    return {
      item,
      unlocked,
      hint: unlocked ? null : (item.hint ?? summarizeUnlock(item.unlock)),
    };
  });
}

export function summarizeUnlock(rule: UnlockRule): string {
  switch (rule.kind) {
    case 'default': return '';
    case 'photos': return rule.count === 1 ? '🔒 1 photo' : `🔒 ${rule.count} photos`;
    case 'feature': {
      const item = lookupFeatureLabel(rule.featureId);
      return `🔒 use ${item} ${rule.count}×`;
    }
    case 'all':
      return rule.rules.map(r => stripLock(summarizeUnlock(r))).filter(Boolean).map(s => '🔒 ' + s).slice(0, 1).join('') ||
        '🔒 ' + rule.rules.map(r => stripLock(summarizeUnlock(r))).join(' + ');
    case 'any':
      return '🔒 ' + rule.rules.map(r => stripLock(summarizeUnlock(r))).join(' or ');
  }
}

function stripLock(s: string): string {
  return s.startsWith('🔒 ') ? s.slice(2).trim() : s;
}

function lookupFeatureLabel(featureKey: string): string {
  const sep = featureKey.indexOf(':');

  if (sep < 0) return featureKey;

  const cat = featureKey.slice(0, sep) as Category;
  const id = featureKey.slice(sep + 1);
  const found = findItem(cat, id);

  return found ? found.label.toLowerCase() : id;
}

export function evaluateUnlocks(state: CustomizationState): ItemDef[] {
  const newly: ItemDef[] = [];

  for (const item of CUSTOMIZATION_CONFIG) {
    if (isUnlocked(state, item.category, item.id)) continue;

    if (ruleSatisfied(item.unlock, state)) {
      state.unlocked[item.category].push(item.id);

      newly.push(item);
    }
  }

  return newly;
}

function ruleSatisfied(rule: UnlockRule, state: CustomizationState): boolean {
  switch (rule.kind) {
    case 'default': return true;
    case 'photos': return state.stats.photosCount >= rule.count;
    case 'feature': return (state.stats.featureUsage[rule.featureId] ?? 0) >= rule.count;
    case 'all': return rule.rules.every(r => ruleSatisfied(r, state));
    case 'any': return rule.rules.some(r => ruleSatisfied(r, state));
  }
}

export interface PhotoCustomizationLike {
  filterId: string;
  frameId: string;
  lightLeakId: string;
  vignetteIntensity: number;
  grainIntensity: number;
  bloomIntensity: number;
}

export function recordPhotoSaved(state: CustomizationState, customization: PhotoCustomizationLike): ItemDef[] {
  state.stats.photosCount += 1;

  bump(state, `filter:${customization.filterId}`);
  bump(state, `frame:${customization.frameId}`);
  bump(state, `lightLeak:${customization.lightLeakId}`);

  if (customization.vignetteIntensity > 0) bump(state, 'feature:vignette');
  if (customization.grainIntensity > 0) bump(state, 'feature:grain');
  if (customization.bloomIntensity > 0) bump(state, 'feature:bloom');

  const newly = evaluateUnlocks(state);

  saveCustomization(state);

  return newly;
}

function bump(state: CustomizationState, key: string): void {
  state.stats.featureUsage[key] = (state.stats.featureUsage[key] ?? 0) + 1;
}
