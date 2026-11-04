// 캐치 간격 판정 — 계정 하나의 캐치 속도가 낚시 한 사이클의 최소 시간을 넘지 못한다
import { describe, it, expect } from 'vitest';
import { catchTooSoon } from './pacing';
import { newState } from './logic';
import { effectiveBite } from './stats';
import { CATCH_MS } from './balance';

type G = ReturnType<typeof newState>;
const s = (over: Partial<G> = {}): G => ({ ...newState(), ...over });
const at = (base: string, ms: number) => new Date(Date.parse(base) + ms).toISOString();
const T0 = '2026-11-02T00:00:00.000Z';

describe('catchTooSoon', () => {
  it('직전 캐치 기록이 없으면 막지 않는다', () => {
    expect(catchTooSoon(s(), 'pond', null, T0)).toBe(false);
  });

  it('획득 표시와 최소 입질 대기를 합친 시간보다 크게 이르면 막는다', () => {
    const cycle = CATCH_MS + effectiveBite(s(), 'pond').min.value * 1000;
    expect(catchTooSoon(s(), 'pond', T0, at(T0, 1000))).toBe(true);
    expect(catchTooSoon(s(), 'pond', T0, at(T0, cycle / 2))).toBe(true);
  });

  it('최소 사이클이 지나면 막지 않는다', () => {
    const cycle = CATCH_MS + effectiveBite(s(), 'pond').min.value * 1000;
    expect(catchTooSoon(s(), 'pond', T0, at(T0, cycle))).toBe(false);
    expect(catchTooSoon(s(), 'pond', T0, at(T0, cycle + 60_000))).toBe(false);
  });

  it('최소 사이클보다 조금 이른 도착은 네트워크 지연으로 보고 허용한다', () => {
    const cycle = CATCH_MS + effectiveBite(s(), 'pond').min.value * 1000;
    expect(catchTooSoon(s(), 'pond', T0, at(T0, cycle - 300))).toBe(false);
  });

  it('낚싯대가 좋아 입질이 빠르면 허용 간격도 짧아진다', () => {
    const low = s({ rod: 1 });
    const high = s({ rod: 30 });
    const highCycle = CATCH_MS + effectiveBite(high, 'pond').min.value * 1000;
    expect(effectiveBite(high, 'pond').min.value).toBeLessThan(effectiveBite(low, 'pond').min.value);
    expect(catchTooSoon(high, 'pond', T0, at(T0, highCycle))).toBe(false);
    expect(catchTooSoon(low, 'pond', T0, at(T0, highCycle))).toBe(true);
  });

  it('시각을 읽을 수 없으면 막지 않는다', () => {
    expect(catchTooSoon(s(), 'pond', 'not-a-date', T0)).toBe(false);
  });
});
