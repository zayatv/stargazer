import type { SavedPhoto, PhotoCustomization } from './photo.types.ts';
import { defaultCustomization } from './photo.types.ts';

const DB_NAME = 'stargazer';
const DB_VERSION = 1;
const PHOTOS_STORE = 'photos';
const CURRENT_PHOTO_SCHEMA = 3;

interface PhotoRecord {
  id: string;
  name: string;
  note: string;
  filterId: string;
  takenAt: number;
  customization: PhotoCustomization;
  tags: string[];
  schemaVersion: number;
  pngBlob: Blob;
  nightId?: string;
}

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const store = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id' });

        store.createIndex('takenAt', 'takenAt', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function putRecord(db: IDBDatabase, record: PhotoRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, 'readwrite');

    tx.objectStore(PHOTOS_STORE).put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);

  return res.blob();
}

export async function loadPhotos(): Promise<SavedPhoto[]> {
  const db = await openDB();

  return new Promise<SavedPhoto[]>((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, 'readonly');
    const req = tx.objectStore(PHOTOS_STORE).getAll();

    req.onsuccess = () => {
      const records = (req.result ?? []) as PhotoRecord[];

      records.sort((a, b) => a.takenAt - b.takenAt);

      const photos: SavedPhoto[] = records.map(recordToPhoto);

      resolve(photos);
    };

    req.onerror = () => reject(req.error);
  });
}

function recordToPhoto(r: PhotoRecord): SavedPhoto {
  return {
    id: r.id,
    name: r.name,
    note: r.note,
    filterId: r.filterId,
    takenAt: r.takenAt,
    customization: r.customization,
    tags: r.tags,
    schemaVersion: r.schemaVersion,
    nightId: r.nightId,
    pngDataUrl: URL.createObjectURL(r.pngBlob),
  };
}

export async function savePhoto(p: SavedPhoto): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!p.pngDataUrl) {
      return {
        ok: false,
        reason: 'Photo has no image data.'
      };
    }

    const blob = await dataUrlToBlob(p.pngDataUrl);
    const db = await openDB();
    const record: PhotoRecord = {
      id: p.id,
      name: p.name,
      note: p.note,
      filterId: p.filterId,
      takenAt: p.takenAt,
      customization: p.customization ?? defaultCustomization(),
      tags: p.tags ?? [],
      schemaVersion: p.schemaVersion ?? CURRENT_PHOTO_SCHEMA,
      pngBlob: blob,
      nightId: p.nightId,
    };

    await putRecord(db, record);

    return { ok: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'IndexedDB error';

    return {
      ok: false,
      reason
    };
  }
}

export function revokePhotoUrls(photos: SavedPhoto[]): void {
  for (const p of photos) {
    if (p.pngDataUrl && p.pngDataUrl.startsWith('blob:')) {
      URL.revokeObjectURL(p.pngDataUrl);
    }
  }
}

export function closePhotoDb(): void {
  if (!_dbPromise) return;

  const p = _dbPromise;

  _dbPromise = null;

  p.then(db => db.close()).catch(() => { });
}

export function generatePhotoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `photo_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}
