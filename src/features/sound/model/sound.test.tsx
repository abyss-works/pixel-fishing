import { describe, expect, it } from 'vitest';
import {
  clampNamedHitStep,
  percentToVolume,
  resolveBiteSfx,
  resolveCastSfx,
  resolveCatchSfx,
  resolveHitSfx,
  resolveLineSnapSfx,
  volumeToPercent,
} from './sound';

describe('sound feature model', () => {
  it('음량 백분율(0~100)과 정규화 값(0~1)을 정확히 변환한다', () => {
    expect(volumeToPercent(0.5)).toBe(50);
    expect(volumeToPercent(0)).toBe(0);
    expect(volumeToPercent(1)).toBe(100);
    expect(volumeToPercent(1.5)).toBe(100);
    expect(percentToVolume(50)).toBe(0.5);
    expect(percentToVolume(0)).toBe(0);
    expect(percentToVolume(120)).toBe(1);
    expect(percentToVolume(-10)).toBe(0);
  });

  it('수동 낚시 캐스팅·입질·챔질은 재생하고 자동 방치는 무음으로 둔다', () => {
    expect(resolveCastSfx(true)).toBe('cast');
    expect(resolveCastSfx(false)).toBeNull();

    expect(resolveBiteSfx(true)).toBe('bite');
    expect(resolveBiteSfx(false)).toBeNull();

    expect(resolveHitSfx('good')).toBe('hitGood');
    expect(resolveHitSfx('perfect')).toBe('hitPerfect');
    expect(resolveHitSfx('normal')).toBeNull();
    expect(resolveHitSfx('auto')).toBeNull();
  });

  it('줄 끊김은 권장 파워 미만 수동 해역 예외일 때만 재생한다', () => {
    expect(resolveLineSnapSfx({ manual: true, underpowered: true })).toBe('lineSnap');
    expect(resolveLineSnapSfx({ manual: true, underpowered: false })).toBeNull();
    expect(resolveLineSnapSfx({ manual: false, underpowered: true })).toBeNull();
  });

  it('어획 스팅어 우선순위: 네임드 토벌 > 돌연변이(전 등급 덮어쓰기) > 전설 > 영웅 > 수동 일반·희귀', () => {
    expect(resolveCatchSfx({ manual: true, rarity: 'legendary', isMutation: true, isNamedClear: true })).toBe('namedClear');

    // 돌연변이는 영웅·전설을 포함한 모든 등급을 단일 오버라이드
    expect(resolveCatchSfx({ manual: false, rarity: 'legendary', isMutation: true })).toBe('catchMutation');
    expect(resolveCatchSfx({ manual: true, rarity: 'epic', isMutation: true })).toBe('catchMutation');
    expect(resolveCatchSfx({ manual: false, rarity: 'common', isMutation: true })).toBe('catchMutation');

    // 일반·희귀가 아닌 영웅·전설은 수동·방치 모두 허용
    expect(resolveCatchSfx({ manual: false, rarity: 'legendary', isMutation: false })).toBe('catchLegend');
    expect(resolveCatchSfx({ manual: true, rarity: 'legendary', isMutation: false })).toBe('catchLegend');
    expect(resolveCatchSfx({ manual: false, rarity: 'epic', isMutation: false })).toBe('catchEpic');
    expect(resolveCatchSfx({ manual: true, rarity: 'epic', isMutation: false })).toBe('catchEpic');

    // 일반·희귀는 수동만 첨벙, 방치는 무음
    expect(resolveCatchSfx({ manual: true, rarity: 'common', isMutation: false })).toBe('catchSplash');
    expect(resolveCatchSfx({ manual: true, rarity: 'rare', isMutation: false })).toBe('catchSplash');
    expect(resolveCatchSfx({ manual: false, rarity: 'common', isMutation: false })).toBeNull();
    expect(resolveCatchSfx({ manual: false, rarity: 'rare', isMutation: false })).toBeNull();
  });

  it('네임드 타격 단계는 1~5 범위로 고정한다', () => {
    expect(clampNamedHitStep(0)).toBe(1);
    expect(clampNamedHitStep(3)).toBe(3);
    expect(clampNamedHitStep(9)).toBe(5);
    expect(clampNamedHitStep(Number.NaN)).toBe(1);
  });
});
