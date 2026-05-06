import type { Howl } from 'howler';

export const VolumeGroup = {
  Master: 0,
  Music: 1,
  SFX: 2,
  Ambient: 3,
} as const;

export type VolumeGroup = (typeof VolumeGroup)[keyof typeof VolumeGroup];

export interface SoundDef {
  src: string[];
  volume?: number;
  loop?: boolean;
  group: VolumeGroup;
  sprite?: Record<string, [number, number] | [number, number, boolean]>;
}

export interface SoundEntry {
  howl: Howl;
  group: VolumeGroup;
  baseVolume: number;
}

export interface ActiveMusic {
  key: string;
  howl: Howl;
  id: number;
}

export interface AudioState {
  _registry: Map<string, SoundEntry>;
  _volumes: number[];
  _muted: boolean[];
  _currentMusic: ActiveMusic | null;
  _paused: boolean;
  _prevTimeScale: number;
}
