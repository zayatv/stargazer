import { closePhotoDb } from './photo/photo.storage.ts';

const STARGAZER_PREFIX = 'stargazer:';
const PHOTO_DB_NAME = 'stargazer';

export async function resetAllData(): Promise<void> {
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);

    if (k && k.startsWith(STARGAZER_PREFIX)) keys.push(k);
  }

  for (const k of keys) localStorage.removeItem(k);

  closePhotoDb();

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(PHOTO_DB_NAME);

    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}
