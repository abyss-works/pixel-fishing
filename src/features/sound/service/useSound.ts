import { useEffect, useSyncExternalStore } from 'react';
import {
  ensureSoundEngineSync,
  getSoundSettings,
  resetSoundSettings,
  setBgmEnabled,
  setBgmVolume,
  setSfxEnabled,
  setSfxVolume,
  subscribeSoundSettings,
  updateSoundSettings,
} from '../../../platform/api/sound';
import type { SoundSettings } from '../../../platform/api/sound';

export type { SoundSettings };
export {
  getSoundSettings,
  resetSoundSettings,
  setBgmEnabled,
  setBgmVolume,
  setSfxEnabled,
  setSfxVolume,
  updateSoundSettings,
};

/** 기기별 소리 설정을 구독하고 배경음·효과음 켜기와 음량 조절 동작을 제공한다 */
export function useSoundSettings() {
  const settings = useSyncExternalStore(subscribeSoundSettings, getSoundSettings, getSoundSettings);

  useEffect(() => {
    ensureSoundEngineSync();
  }, []);

  return {
    ...settings,
    setBgmEnabled,
    setSfxEnabled,
    setBgmVolume,
    setSfxVolume,
    toggleBgm: () => setBgmEnabled(!settings.bgmEnabled),
    toggleSfx: () => setSfxEnabled(!settings.sfxEnabled),
  };
}
