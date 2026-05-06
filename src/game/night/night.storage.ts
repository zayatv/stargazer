import type { NightRecord } from './night.types.ts';
import { CURRENT_NIGHT_SCHEMA } from './night.types.ts';

const STORAGE_KEY = 'stargazer:nights';

export function loadNights(): NightRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw) {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        return parsed.map(normalize).filter((n): n is NightRecord => n !== null);
      }
    }
  } catch { }

  return [];
}

export function saveNights(list: NightRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { }
}

function normalize(raw: unknown): NightRecord | null {
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Partial<NightRecord> & Record<string, unknown>;

  if (typeof r.id !== 'string' || typeof r.seed !== 'number' || typeof r.number !== 'number') {
    return null;
  }

  return {
    id: r.id,
    number: r.number,
    seed: r.seed,
    startedAt: typeof r.startedAt === 'number' ? r.startedAt : 0,
    endedAt: typeof r.endedAt === 'number' ? r.endedAt : 0,
    photoCount: typeof r.photoCount === 'number' ? r.photoCount : 0,
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : CURRENT_NIGHT_SCHEMA,
  };
}
