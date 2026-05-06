import type { NightRecord } from './night.types.ts';
import { CURRENT_NIGHT_SCHEMA } from './night.types.ts';
import { loadNights, saveNights } from './night.storage.ts';

let _current: NightRecord | null = null;

export function startNight(): NightRecord {
  const list = loadNights();
  const night: NightRecord = {
    id: generateNightId(),
    number: list.length + 1,
    seed: (Math.random() * 0x7fffffff) | 0,
    startedAt: Date.now(),
    endedAt: 0,
    photoCount: 0,
    schemaVersion: CURRENT_NIGHT_SCHEMA,
  };

  list.push(night);

  saveNights(list);

  _current = night;

  return night;
}

export function getCurrentNight(): NightRecord | null {
  return _current;
}

export function endCurrentNight(): void {
  if (!_current) return;

  _current.endedAt = Date.now();

  persistCurrent();

  _current = null;
}

export function bumpCurrentNightPhotoCount(): void {
  if (!_current) return;

  _current.photoCount += 1;

  persistCurrent();
}

export function getCompletedNightCount(): number {
  return loadNights().filter(n => n.endedAt > 0).length;
}

function persistCurrent(): void {
  if (!_current) return;

  const list = loadNights();
  const idx = list.findIndex(n => n.id === _current!.id);

  if (idx >= 0) list[idx] = _current;
  else list.push(_current);

  saveNights(list);
}

function generateNightId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `night_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
