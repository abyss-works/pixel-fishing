import type { SoundSettings } from '../api/types';

// 기기별 소리 설정(localStorage) — 배경음·효과음 켜기와 음량(0~1)은 세이브나 서버 권위 대상이 아니다.
// 방치 사용 환경을 우선해 기본값은 배경음·효과음 모두 꺼짐, 음량은 50%(0.5)다.
export const SOUND_KEYS = {
  bgmEnabled: 'pf-sound-bgm',
  sfxEnabled: 'pf-sound-sfx',
  bgmVolume: 'pf-sound-bgm-volume',
  sfxVolume: 'pf-sound-sfx-volume',
} as const;

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  bgmEnabled: false,
  sfxEnabled: false,
  bgmVolume: 0.5,
  sfxVolume: 0.5,
};

function readKey(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    /* 저장소 접근이 막힌 환경 — 이번 세션 메모리 상태만 유지 */
  }
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOUND_SETTINGS.bgmVolume;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100) / 100;
}

function parseVolume(raw: string | null, fallback: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampVolume(parsed);
}

/** 저장소에서 현재 기기 소리 설정을 읽는다 */
export function loadSoundSettings(): SoundSettings {
  return {
    bgmEnabled: readKey(SOUND_KEYS.bgmEnabled) === 'on',
    sfxEnabled: readKey(SOUND_KEYS.sfxEnabled) === 'on',
    bgmVolume: parseVolume(readKey(SOUND_KEYS.bgmVolume), DEFAULT_SOUND_SETTINGS.bgmVolume),
    sfxVolume: parseVolume(readKey(SOUND_KEYS.sfxVolume), DEFAULT_SOUND_SETTINGS.sfxVolume),
  };
}

let current: SoundSettings = loadSoundSettings();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function commit(next: SoundSettings): void {
  if (
    current.bgmEnabled === next.bgmEnabled
    && current.sfxEnabled === next.sfxEnabled
    && current.bgmVolume === next.bgmVolume
    && current.sfxVolume === next.sfxVolume
  ) {
    return;
  }
  current = next;
  notify();
}

export function getSoundSettings(): SoundSettings {
  return current;
}

export function setBgmEnabled(next: boolean): void {
  writeKey(SOUND_KEYS.bgmEnabled, next ? 'on' : 'off');
  commit({ ...current, bgmEnabled: next });
}

export function setSfxEnabled(next: boolean): void {
  writeKey(SOUND_KEYS.sfxEnabled, next ? 'on' : 'off');
  commit({ ...current, sfxEnabled: next });
}

export function setBgmVolume(next: number): void {
  const volume = clampVolume(next);
  writeKey(SOUND_KEYS.bgmVolume, String(volume));
  commit({ ...current, bgmVolume: volume });
}

export function setSfxVolume(next: number): void {
  const volume = clampVolume(next);
  writeKey(SOUND_KEYS.sfxVolume, String(volume));
  commit({ ...current, sfxVolume: volume });
}

export function updateSoundSettings(patch: Partial<SoundSettings>): void {
  const next: SoundSettings = {
    bgmEnabled: patch.bgmEnabled ?? current.bgmEnabled,
    sfxEnabled: patch.sfxEnabled ?? current.sfxEnabled,
    bgmVolume: patch.bgmVolume !== undefined ? clampVolume(patch.bgmVolume) : current.bgmVolume,
    sfxVolume: patch.sfxVolume !== undefined ? clampVolume(patch.sfxVolume) : current.sfxVolume,
  };
  if (patch.bgmEnabled !== undefined) writeKey(SOUND_KEYS.bgmEnabled, next.bgmEnabled ? 'on' : 'off');
  if (patch.sfxEnabled !== undefined) writeKey(SOUND_KEYS.sfxEnabled, next.sfxEnabled ? 'on' : 'off');
  if (patch.bgmVolume !== undefined) writeKey(SOUND_KEYS.bgmVolume, String(next.bgmVolume));
  if (patch.sfxVolume !== undefined) writeKey(SOUND_KEYS.sfxVolume, String(next.sfxVolume));
  commit(next);
}

export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 저장소에서 다시 읽어 메모리 스냅샷을 동기화한다 */
export function reloadSoundSettings(): void {
  commit(loadSoundSettings());
}

/** 테스트 격리용 — 메모리 값을 기본값으로 되돌린다(저장소는 건드리지 않는다) */
export function resetSoundSettings(): void {
  commit({ ...DEFAULT_SOUND_SETTINGS });
}
