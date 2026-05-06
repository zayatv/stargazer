export {
  type AudioState,
  type SoundDef,
  type SoundEntry,
  type ActiveMusic,
  VolumeGroup,
} from './audio.types.ts';

export {
  createAudioState,
  registerSound,
  unregisterSound,
  playSound,
  stopSound,
  playMusic,
  stopMusic,
  setGroupVolume,
  getGroupVolume,
  setMasterVolume,
  muteGroup,
  isGroupMuted,
  pauseAll,
  resumeAll,
  audioSystem,
} from './audio.ts';
