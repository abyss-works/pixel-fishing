import {
  DEFAULT_SOUND_SETTINGS,
  getSoundSettings,
  loadSoundSettings,
  reloadSoundSettings,
  resetSoundSettings as resetStoredSoundSettings,
  SOUND_KEYS,
  setBgmEnabled as writeBgmEnabled,
  setBgmVolume as writeBgmVolume,
  setSfxEnabled as writeSfxEnabled,
  setSfxVolume as writeSfxVolume,
  subscribeSoundSettings,
  updateSoundSettings as writeSoundSettingsPatch,
} from '../adapters/sound';
import {
  BGM_ASSET_PATH,
  BGM_CROSSFADE_SEC,
  BGM_RESUME_FADE_IN_SEC,
  ensureSoundEngineSync,
  resetSoundEngineSync,
  SoundEngine,
  soundEngine,
} from '../audio/soundEngine';
import type { SfxKey, SoundEngineState } from '../audio/soundEngine';
import type { SoundSettings } from './types';

export {
  BGM_ASSET_PATH,
  BGM_CROSSFADE_SEC,
  BGM_RESUME_FADE_IN_SEC,
  DEFAULT_SOUND_SETTINGS,
  SOUND_KEYS,
  SoundEngine,
  ensureSoundEngineSync,
  getSoundSettings,
  loadSoundSettings,
  reloadSoundSettings,
  resetSoundEngineSync,
  soundEngine,
  subscribeSoundSettings,
};
export type { SfxKey, SoundEngineState, SoundSettings };

export function setBgmEnabled(enabled: boolean): void {
  ensureSoundEngineSync();
  writeBgmEnabled(enabled);
}

export function setSfxEnabled(enabled: boolean): void {
  ensureSoundEngineSync();
  writeSfxEnabled(enabled);
}

export function setBgmVolume(volume: number): void {
  ensureSoundEngineSync();
  writeBgmVolume(volume);
}

export function setSfxVolume(volume: number): void {
  ensureSoundEngineSync();
  writeSfxVolume(volume);
}

export function updateSoundSettings(patch: Partial<SoundSettings>): void {
  ensureSoundEngineSync();
  writeSoundSettingsPatch(patch);
}

export function resetSoundSettings(): void {
  resetStoredSoundSettings();
  resetSoundEngineSync();
}

export function playSfx(key: SfxKey, arg?: number): boolean {
  ensureSoundEngineSync();
  return soundEngine.playSfx(key, arg);
}

export function getSoundEngineState(): SoundEngineState {
  return soundEngine.getState();
}

export const soundApi = {
  getSettings: getSoundSettings,
  setBgmEnabled,
  setSfxEnabled,
  setBgmVolume,
  setSfxVolume,
  updateSettings: updateSoundSettings,
  subscribe: subscribeSoundSettings,
  resetSettings: resetSoundSettings,
  playSfx,
  getEngineState: getSoundEngineState,
} as const;
