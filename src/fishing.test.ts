// 낚시 상태머신 순수 모듈 — 전이/판정/획득 규칙 
import { describe, it, expect } from 'vitest';
import { nextPhase, phaseDurationMs, judgePress, resolveCatch, autoCommonBoost } from './fishing';
import { rodStats, RARITY } from './logic';
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

describe('R6b: 챔질 판정 (경과 시간 → 존)', () => {
  it('sweep 정중앙 = perfect, 시작/끝 = normal', () => {
    const st = rodStats(1); // sweep 1s, zone 24%
    expect(judgePress(st.sweep * 1000 * 0.5, 1)).toBe('perfect');
    expect(judgePress(0, 1)).toBe('normal');
    expect(judgePress(st.sweep * 1000 * 0.99, 1)).toBe('normal');
    // 존 경계: 0.5 ± zone/2
    expect(judgePress(st.sweep * 1000 * (0.5 + st.zone / 2 - 0.01), 1)).toBe('perfect');
    expect(judgePress(st.sweep * 1000 * (0.5 + st.zone / 2 + 0.01), 1)).toBe('normal');
  });
});

describe('R8/R9/R11: 획득 결정', () => {
  it('전 판정이 해당 수역 풀에서 추첨된다', () => {
    expect(resolveCatch('pond', 'normal', 1, () => 0).spot).toBe('pond');
    expect(resolveCatch('sea', 'perfect', 1, () => 0.999).spot).toBe('sea');
    expect(resolveCatch('deep', 'auto', 1, () => 0.5).spot).toBe('deep');
  });

  const rareRate = (j: 'perfect' | 'normal' | 'auto', rod: number, n = 20000) => {
    let rare = 0;
    for (let i = 0; i < n; i++) {
      if (RARITY[resolveCatch('pond', j, rod).rarity].weight < RARITY.common.weight) rare++;
    }
    return rare / n;
  };

  it('희귀 이상 확률: perfect > normal ≫ auto (통계적)', () => {
    const perfect = rareRate('perfect', 1);
    const normal = rareRate('normal', 1);
    const auto = rareRate('auto', 1);
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
