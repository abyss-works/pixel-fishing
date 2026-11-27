import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as soundApi from '../../../platform/api/sound';
import {
  emitBiteSound,
  emitButtonClickSound,
  emitCastSound,
  emitCatchSound,
  emitEventSettleSound,
  emitGearUpgradeSound,
  emitHitSound,
  emitLineSnapSound,
  emitNamedClearSound,
  emitNamedEscapeSound,
  emitNamedHitSound,
  emitNamedMissSound,
  emitNamedSpawnSound,
  emitRewardClaimSound,
  emitShopSellSound,
} from './soundEvents';
import { resetSoundSettings, useSoundSettings } from './useSound';

describe('sound feature service', () => {
  beforeEach(() => {
    localStorage.clear();
    resetSoundSettings();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    resetSoundSettings();
    vi.restoreAllMocks();
  });

  it('useSoundSettings는 기본값(꺼짐, 50%)으로 시작하고 토글과 음량을 저장한다', () => {
    const { result } = renderHook(() => useSoundSettings());
    expect(result.current.bgmEnabled).toBe(false);
    expect(result.current.sfxEnabled).toBe(false);
    expect(result.current.bgmVolume).toBe(0.5);
    expect(result.current.sfxVolume).toBe(0.5);

    act(() => {
      result.current.toggleBgm();
      result.current.setSfxEnabled(true);
      result.current.setBgmVolume(0.8);
      result.current.setSfxVolume(0.25);
    });

    expect(result.current.bgmEnabled).toBe(true);
    expect(result.current.sfxEnabled).toBe(true);
    expect(result.current.bgmVolume).toBe(0.8);
    expect(result.current.sfxVolume).toBe(0.25);
    expect(localStorage.getItem('pf-sound-bgm')).toBe('on');
    expect(localStorage.getItem('pf-sound-sfx')).toBe('on');
    expect(localStorage.getItem('pf-sound-bgm-volume')).toBe('0.8');
    expect(localStorage.getItem('pf-sound-sfx-volume')).toBe('0.25');
  });

  it('soundEvents는 명세된 조건과 우선순위로 playSfx를 호출한다', () => {
    const spy = vi.spyOn(soundApi, 'playSfx').mockReturnValue(true);

    emitCastSound(false);
    emitBiteSound(false);
    emitHitSound('auto');
    emitLineSnapSound({ manual: false, underpowered: true });
    emitCatchSound({ manual: false, rarity: 'rare', isMutation: false });
    expect(spy).not.toHaveBeenCalled();

    emitCastSound(true);
    emitBiteSound(true);
    emitHitSound('good');
    emitHitSound('perfect');
    emitLineSnapSound({ manual: true, underpowered: true });
    emitCatchSound({ manual: true, rarity: 'common', isMutation: false });
    emitCatchSound({ manual: false, rarity: 'legendary', isMutation: true });
    emitCatchSound({ manual: false, rarity: 'legendary', isMutation: false });
    emitCatchSound({ manual: false, rarity: 'epic', isMutation: false });
    emitNamedSpawnSound();
    emitNamedHitSound(7);
    emitNamedMissSound();
    emitNamedClearSound();
    emitNamedEscapeSound();
    emitShopSellSound();
    emitGearUpgradeSound();
    emitRewardClaimSound();
    emitEventSettleSound();
    emitButtonClickSound();

    expect(spy.mock.calls).toEqual([
      ['cast', undefined],
      ['bite', undefined],
      ['hitGood', undefined],
      ['hitPerfect', undefined],
      ['lineSnap', undefined],
      ['catchSplash', undefined],
      ['catchMutation', undefined],
      ['catchLegend', undefined],
      ['catchEpic', undefined],
      ['namedSpawn'],
      ['namedHit', 5],
      ['namedMiss'],
      ['namedClear'],
      ['namedEscape'],
      ['shopSell'],
      ['gearUpgrade'],
      ['rewardClaim'],
      ['eventSettle'],
      ['buttonClick'],
    ]);
  });
});
