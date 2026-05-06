export const CURRENT_NIGHT_SCHEMA = 1;

export interface NightRecord {
  id: string;
  number: number;
  seed: number;
  startedAt: number;
  endedAt: number;
  photoCount: number;
  schemaVersion: number;
}
