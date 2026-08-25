// 낚시 상태머신 순수 모듈 — 전이/판정/획득 규칙
import { describe, it, expect } from 'vitest';
import { nextPhase, phaseDurationMs, resolveCatch, autoCommonBoost } from './fishing';
import { judgeTiming, rodStats, RARITY } from './logic';
import type { Judgment } from './logic';
import { AUTO_COMMON_BOOST, CATCH_MS, CATCH_MS_LEGENDARY } from './balance';

describe('R6: 전이 표 (캐스팅 연출 단계 없음 — 던지면 바로 대기)', () => {
  it('wait → bite → catch(방치) → wait(재캐스트) 순환', () => {
    expect(nextPhase('wait')).toBe('bite');
    expect(nextPhase('bite')).toBe('catch');
    expect(nextPhase('catch')).toBe('wait');
  });
});

describe('단계 지속 시간', () => {
  it('catch는 고정, bite는 sweep, wait는 낚싯대 범위 내 랜덤', () => {
    const st = rodStats(1);
    expect(phaseDurationMs('catch', 1)).toBe(CATCH_MS);
    expect(phaseDurationMs('bite', 1)).toBe(st.sweep * 1000);
    expect(phaseDurationMs('wait', 1, () => 0)).toBe(st.biteMin * 1000);
    expect(phaseDurationMs('wait', 1, () => 1)).toBeCloseTo(st.biteMax * 1000);
  });

  it('전설 등급 catch는 이펙트를 더 보여주려고 조금 더 길다', () => {
    expect(phaseDurationMs('catch', 1, undefined, 'legendary')).toBe(CATCH_MS_LEGENDARY);
    expect(phaseDurationMs('catch', 1, undefined, 'epic')).toBe(CATCH_MS);
    expect(CATCH_MS_LEGENDARY).toBeGreaterThan(CATCH_MS);
  });
});

describe('R6b: 챔질 판정 (커서 위치 → 이중 존)', () => {
  const at = (pos: number, yellow: number, red = 0) => judgeTiming(pos, yellow, red);

  it('노란 존 경계 — 안이면 perfect, 밖이면 normal', () => {
    const z = 0.24;
    expect(at(0.5, z)).toBe('perfect');
    expect(at(0, z)).toBe('normal');
    expect(at(0.99, z)).toBe('normal');
    // 존 경계: 0.5 ± yellow/2
    expect(at(0.5 + z / 2 - 0.01, z)).toBe('perfect');
    expect(at(0.5 + z / 2 + 0.01, z)).toBe('normal');
  });

  it('빨간 존은 노란 존 안의 최내각 — superb > perfect > normal', () => {
    expect(at(0.5, 0.24, 0.20)).toBe('superb');            // 정중앙
    expect(at(0.5 + 0.105, 0.24, 0.20)).toBe('perfect');   // 빨간 밖(반폭 0.10) · 노란 안(반폭 0.12)
    expect(at(0.5 - 0.09, 0.24, 0.20)).toBe('superb');
    expect(at(0.5 + 0.125, 0.24, 0.20)).toBe('normal');    // 둘 다 밖
    expect(at(0.5, 0.24)).toBe('perfect');                 // 빨간 없으면 superb 불가
  });
});

describe('R8/R9/R11: 획득 결정', () => {
  it('전 판정이 해당 수역 풀에서 추첨된다', () => {
    expect(resolveCatch('pond', 'normal', 1, () => 0).spot).toBe('pond');
    expect(resolveCatch('sea', 'perfect', 1, () => 0.999).spot).toBe('sea');
    expect(resolveCatch('deep', 'auto', 1, () => 0.5).spot).toBe('deep');
  });

  const rareRate = (j: Judgment, rod: number, n = 20000) => {
    let rare = 0;
    for (let i = 0; i < n; i++) {
      if (RARITY[resolveCatch('pond', j, rod).rarity].weight < RARITY.common.weight) rare++;
    }
    return rare / n;
  };

  it('희귀 이상 확률: superb > perfect > normal ≫ auto (통계적)', () => {
    const superb = rareRate('superb', 1);
    const perfect = rareRate('perfect', 1);
    const normal = rareRate('normal', 1);
    const auto = rareRate('auto', 1);
    expect(superb).toBeGreaterThan(perfect + 0.02); // 일반 ÷2 vs ÷1.6
    expect(perfect).toBeGreaterThan(normal + 0.02);
    expect(auto).toBeLessThan(normal / 5); // 방치 ≈ 수동의 1/10 수준
    expect(auto).toBeGreaterThan(0.005);   // 그래도 희귀가 뜨긴 한다
  });

  it('R9b: 낚싯대가 좋을수록 방치 페널티가 완화된다 (10배 → 4배 수렴)', () => {
    expect(autoCommonBoost(1)).toBe(AUTO_COMMON_BOOST.from);
    expect(autoCommonBoost(50)).toBeLessThan(AUTO_COMMON_BOOST.from);
    expect(autoCommonBoost(100000)).toBeGreaterThan(AUTO_COMMON_BOOST.to);
    expect(rareRate('auto', 50)).toBeGreaterThan(rareRate('auto', 1));
  });
});
