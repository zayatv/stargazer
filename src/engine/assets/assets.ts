import type { AssetState, AssetEntry } from './assets.types.ts';
import { AssetType } from './assets.types.ts';

export function createAssetState(): AssetState {
  return {
    _images: new Map(),
    _json: new Map(),
    _fonts: new Map(),
    _pending: [],
    _loading: false,
    _progress: 0,
    _total: 0,
    _loaded: 0,
    _errors: [],
  };
}

export function enqueueImage(state: AssetState, key: string, url: string): void {
  state._pending.push({ type: AssetType.Image, key, url });
}

export function enqueueJSON(state: AssetState, key: string, url: string): void {
  state._pending.push({ type: AssetType.JSON, key, url });
}

export function enqueueFont(state: AssetState, key: string, family: string, url: string): void {
  state._pending.push({ type: AssetType.Font, key, url, fontFamily: family });
}

function loadImage(entry: AssetEntry): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${entry.url}`));
    img.src = entry.url;
  });
}

async function loadJSON(entry: AssetEntry): Promise<unknown> {
  const res = await fetch(entry.url);

  if (!res.ok) throw new Error(`Failed to load JSON: ${entry.url} (${res.status})`);

  return res.json();
}

async function loadFont(entry: AssetEntry): Promise<FontFace> {
  const family = entry.fontFamily ?? entry.key;
  const face = new FontFace(family, `url(${entry.url})`);

  await face.load();

  document.fonts.add(face);

  return face;
}

export async function loadAll(state: AssetState): Promise<void> {
  if (state._pending.length === 0) return;

  state._loading = true;
  state._total = state._pending.length;
  state._loaded = 0;
  state._progress = 0;
  state._errors = [];

  const entries = state._pending.slice();

  state._pending.length = 0;

  const promises = entries.map(async (entry) => {
    try {
      switch (entry.type) {
        case AssetType.Image: {
          const img = await loadImage(entry);

          state._images.set(entry.key, img);

          break;
        }
        case AssetType.JSON: {
          const data = await loadJSON(entry);

          state._json.set(entry.key, data);

          break;
        }
        case AssetType.Font: {
          const face = await loadFont(entry);

          state._fonts.set(entry.key, face);

          break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      state._errors.push(msg);
    } finally {
      state._loaded++;
      state._progress = state._total > 0 ? state._loaded / state._total : 1;
    }
  });

  await Promise.all(promises);

  state._loading = false;
}

export function getImage(state: AssetState, key: string): HTMLImageElement | null {
  return state._images.get(key) ?? null;
}

export function getJSON<T = unknown>(state: AssetState, key: string): T | null {
  return (state._json.get(key) as T) ?? null;
}

export function getFont(state: AssetState, key: string): FontFace | null {
  return state._fonts.get(key) ?? null;
}

export function isLoading(state: AssetState): boolean {
  return state._loading;
}

export function getProgress(state: AssetState): number {
  return state._progress;
}

export function hasErrors(state: AssetState): boolean {
  return state._errors.length > 0;
}

export function getErrors(state: AssetState): readonly string[] {
  return state._errors;
}
