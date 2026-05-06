import { Howl, Howler } from 'howler';
import type { AudioState, SoundDef } from './audio.types.ts';
import { VolumeGroup } from './audio.types.ts';
import type { GameWorld } from '../types.ts';

export function createAudioState(): AudioState {
  return {
    _registry: new Map(),
    _volumes: [1, 1, 1, 1],
    _muted: [false, false, false, false],
    _currentMusic: null,
    _paused: false,
    _prevTimeScale: 1,
  };
}

function effectiveVolume(state: AudioState, group: VolumeGroup, baseVolume: number): number {
  return baseVolume * state._volumes[group] * state._volumes[VolumeGroup.Master];
}

function updateRegistryVolumes(state: AudioState, group?: VolumeGroup): void {
  state._registry.forEach((entry) => {
    if (group !== undefined && entry.group !== group && group !== VolumeGroup.Master) return;

    const vol = effectiveVolume(state, entry.group, entry.baseVolume);

    entry.howl.volume(vol);
  });
}

export function registerSound(state: AudioState, key: string, def: SoundDef): void {
  const baseVolume = def.volume ?? 1;
  const vol = effectiveVolume(state, def.group, baseVolume);

  const howl = new Howl({
    src: def.src,
    volume: vol,
    loop: def.loop ?? false,
    sprite: def.sprite,
  });

  state._registry.set(key, { howl, group: def.group, baseVolume });
}

export function unregisterSound(state: AudioState, key: string): void {
  const entry = state._registry.get(key);

  if (!entry) return;

  entry.howl.unload();

  state._registry.delete(key);

  if (state._currentMusic?.key === key) {
    state._currentMusic = null;
  }
}

export function playSound(state: AudioState, key: string, sprite?: string): number {
  const entry = state._registry.get(key);

  if (!entry) return -1;

  const vol = effectiveVolume(state, entry.group, entry.baseVolume);

  entry.howl.volume(vol);

  return entry.howl.play(sprite);
}

export function stopSound(state: AudioState, key: string, id?: number): void {
  const entry = state._registry.get(key);

  if (!entry) return;

  entry.howl.stop(id);
}

export function playMusic(state: AudioState, key: string, fadeMs = 1000): void {
  const entry = state._registry.get(key);

  if (!entry) return;

  if (state._currentMusic?.key === key) return;

  if (state._currentMusic) {
    const prev = state._currentMusic;

    prev.howl.fade(prev.howl.volume() as number, 0, fadeMs, prev.id);

    prev.howl.once('fade', () => {
      prev.howl.stop(prev.id);
    }, prev.id);
  }

  const vol = effectiveVolume(state, entry.group, entry.baseVolume);

  entry.howl.volume(0);

  const id = entry.howl.play();

  entry.howl.fade(0, vol, fadeMs, id);

  state._currentMusic = { key, howl: entry.howl, id };
}

export function stopMusic(state: AudioState, fadeMs = 1000): void {
  if (!state._currentMusic) return;

  const cur = state._currentMusic;

  if (fadeMs > 0) {
    cur.howl.fade(cur.howl.volume() as number, 0, fadeMs, cur.id);

    cur.howl.once('fade', () => {
      cur.howl.stop(cur.id);
    }, cur.id);
  } else {
    cur.howl.stop(cur.id);
  }

  state._currentMusic = null;
}

export function setGroupVolume(state: AudioState, group: VolumeGroup, volume: number): void {
  state._volumes[group] = Math.max(0, Math.min(1, volume));

  if (group === VolumeGroup.Master) {
    updateRegistryVolumes(state);
  } else {
    updateRegistryVolumes(state, group);
  }
}

export function getGroupVolume(state: AudioState, group: VolumeGroup): number {
  return state._volumes[group];
}

export function setMasterVolume(state: AudioState, volume: number): void {
  setGroupVolume(state, VolumeGroup.Master, volume);

  Howler.volume(volume);
}

export function muteGroup(state: AudioState, group: VolumeGroup, muted: boolean): void {
  state._muted[group] = muted;

  if (group === VolumeGroup.Master) {
    Howler.mute(muted);
  } else {
    state._registry.forEach((entry) => {
      if (entry.group === group) {
        entry.howl.mute(muted);
      }
    });
  }
}

export function isGroupMuted(state: AudioState, group: VolumeGroup): boolean {
  return state._muted[group];
}

export function pauseAll(state: AudioState): void {
  state._paused = true;

  state._registry.forEach((entry) => {
    entry.howl.pause();
  });
}

export function resumeAll(state: AudioState): void {
  state._paused = false;

  state._registry.forEach((entry) => {
    if (entry.howl.playing()) return;
  });

  if (state._currentMusic) {
    const cur = state._currentMusic;

    if (!cur.howl.playing(cur.id)) {
      cur.howl.play(cur.id);
    }
  }
}

export function audioSystem(world: GameWorld): GameWorld {
  const audio = world.audio;
  const timeScale = world.time.timeScale;

  if (timeScale !== audio._prevTimeScale) {
    audio._prevTimeScale = timeScale;

    if (timeScale === 0) {
      if (!audio._paused) pauseAll(audio);
    } else {
      if (audio._paused) resumeAll(audio);

      const rate = Math.max(0.5, Math.min(4.0, timeScale));

      audio._registry.forEach((entry) => {
        entry.howl.rate(rate);
      });
    }
  }

  return world;
}
