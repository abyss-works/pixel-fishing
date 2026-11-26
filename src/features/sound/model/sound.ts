import type { Judgment, RarityId } from '../../../game/rules/logic';
import type { SfxKey } from '../../../platform/api/sound';

// 소리 설정 UI 문구 — 알림과 소리 통합 창 및 설정 창이 같은 문구 근원을 공유한다.
export const SOUND_COPY = {
  title: '소리',
  bgmLabel: '배경음',
  sfxLabel: '효과음',
  bgmVolumeLabel: '배경음 음량',
  sfxVolumeLabel: '효과음 음량',
  onLabel: '켜짐',
  offLabel: '꺼짐',
  promptDescription: '배경음과 효과음을 따로 켜고 끌 수 있으며, 설정에서 언제든 바꿀 수 있어요.',
  backgroundMuteTip: '다른 탭을 보는 동안에는 소리가 멈추고 돌아오면 다시 켜져요.',
} as const;

export function volumeToPercent(volume: number): number {
  if (!Number.isFinite(volume)) return 50;
  return Math.round(Math.max(0, Math.min(1, volume)) * 100);
}

export function percentToVolume(percent: number): number {
  if (!Number.isFinite(percent)) return 0.5;
  return Math.round(Math.max(0, Math.min(100, percent))) / 100;
}

export function resolveCastSfx(manual: boolean): SfxKey | null {
  return manual ? 'cast' : null;
}

export function resolveBiteSfx(manual: boolean): SfxKey | null {
  return manual ? 'bite' : null;
}

export function resolveHitSfx(judgment: Judgment): SfxKey | null {
  if (judgment === 'perfect') return 'hitPerfect';
  if (judgment === 'good') return 'hitGood';
  return null;
}

export function resolveLineSnapSfx({ manual, underpowered }: {
  manual: boolean;
  underpowered: boolean;
}): SfxKey | null {
  return manual && underpowered ? 'lineSnap' : null;
}

/**
 * 포획 효과음 우선순위 판정.
 * 네임드 토벌 > 돌연변이(전설·영웅 포함 모든 등급 덮어쓰기) > 전설 > 영웅 > 수동 일반·희귀 순으로 고르고,
 * 자동 방치의 일반·희귀 포획은 무음으로 둔다.
 */
export function resolveCatchSfx({ manual, rarity, isMutation, isNamedClear }: {
  manual: boolean;
  rarity: RarityId;
  isMutation: boolean;
  isNamedClear?: boolean;
}): SfxKey | null {
  if (isNamedClear) return 'namedClear';
  if (isMutation) return 'catchMutation';
  if (rarity === 'legendary') return 'catchLegend';
  if (rarity === 'epic') return 'catchEpic';
  return manual ? 'catchSplash' : null;
}

export function clampNamedHitStep(step: number): number {
  if (!Number.isFinite(step)) return 1;
  return Math.max(1, Math.min(5, Math.round(step)));
}
