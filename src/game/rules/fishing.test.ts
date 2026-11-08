// 낚시 상태머신 순수 모듈 — 전이/판정/획득 규칙
import { describe, it, expect } from 'vitest';
import { nextPhase, resultAtOf, phaseDurationMs } from './fishing';
import { judgeTiming, rodStats } from './logic';
import { CATCH_MS, CATCH_MS_LEGENDARY } from './balance';

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

  it('노란 존 경계 — 안이면 good, 밖이면 normal', () => {
    const z = 0.24;
    expect(at(0.5, z)).toBe('good');
    expect(at(0, z)).toBe('normal');
    expect(at(0.99, z)).toBe('normal');
    // 존 경계: 0.5 ± yellow/2
    expect(at(0.5 + z / 2 - 0.01, z)).toBe('good');
    expect(at(0.5 + z / 2 + 0.01, z)).toBe('normal');
  });

  it('빨간 존은 노란 존 안의 최내각 — perfect > good > normal', () => {
    expect(at(0.5, 0.24, 0.20)).toBe('perfect');            // 정중앙
    expect(at(0.5 + 0.105, 0.24, 0.20)).toBe('good');   // 빨간 밖(반폭 0.10) · 노란 안(반폭 0.12)
    expect(at(0.5 - 0.09, 0.24, 0.20)).toBe('perfect');
    expect(at(0.5 + 0.125, 0.24, 0.20)).toBe('normal');    // 둘 다 밖
    expect(at(0.5, 0.24)).toBe('good');                 // 빨간 없으면 perfect 불가
  });
});

describe('resultAtOf: 던짐의 첫 결과 시각', () => {
  it('던진 뒤 결과가 나오기 전에는 null, 처음 catch 단계에 든 시각이 첫 결과다', () => {
    expect(resultAtOf(null, 'wait', 100)).toBeNull();
    expect(resultAtOf(null, 'bite', 200)).toBeNull();
    expect(resultAtOf(null, 'catch', 300)).toBe(300);
  });
  it('이어지는 단계와 재캐스트에서는 첫 결과 시각을 유지한다', () => {
    expect(resultAtOf(300, 'catch', 400)).toBe(300);
    expect(resultAtOf(300, 'wait', 500)).toBe(300);
    expect(resultAtOf(300, 'bite', 600)).toBe(300);
  });
  it('줄을 거두면(idle) 지우고, 다시 던진 뒤 첫 결과부터 새로 센다', () => {
    expect(resultAtOf(300, 'idle', 700)).toBeNull();
    expect(resultAtOf(null, 'wait', 800)).toBeNull();
    expect(resultAtOf(null, 'catch', 900)).toBe(900);
  });
});
