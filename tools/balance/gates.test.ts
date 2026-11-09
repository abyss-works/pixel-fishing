import { afterEach, describe, expect, it } from 'vitest';
import { applyOverride } from './flow/override';
import { GATE_FROM_SPOT, GATE_POOLS, KNOWN_INVERSIONS, gateRows, judgeGate } from './gates';

const keyOf = (r: { spot: string; pool: string }) => `${r.spot} ${r.pool}`;

describe('이동 직후 수입 게이트', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('현재 값에서는 위반과 개선이 없고 알려진 역전만 (해역, 풀) 단위로 예외다', () => {
    const rows = gateRows();
    expect(rows.filter(r => r.verdict === '위반' || r.verdict === '개선')).toEqual([]);
    const expected = Object.entries(KNOWN_INVERSIONS).flatMap(([spot, byPool]) => Object.keys(byPool!).map(pool => `${spot} ${pool}`));
    expect(rows.filter(r => r.verdict === '예외').map(keyOf).sort()).toEqual(expected.sort());
  });

  it('태평양부터 마지막 해역까지 전환마다 낮 풀과 낮밤 혼합 두 줄이다', () => {
    const rows = gateRows();
    expect(rows[0].spot).toBe(GATE_FROM_SPOT);
    expect(rows.filter(r => r.spot === rows[0].spot).map(r => r.pool)).toEqual([...GATE_POOLS]);
    for (const r of rows) expect(r.diff).toBeCloseTo(r.after - r.before, 6);
  });

  it('판정: 목록에 없으면 0 이상 통과, 미만 위반', () => {
    expect(judgeGate('inianxx' as never, 'day', 0)).toBe('통과');
    expect(judgeGate('inianxx' as never, 'day', -1)).toBe('위반');
  });

  it('판정: 목록에 있으면 알려진 값과 같으면 예외, 좋아지면 개선(0 이상 포함), 나빠지면 위반이다', () => {
    const known = KNOWN_INVERSIONS.southindian!.day;
    expect(judgeGate('southindian', 'day', known)).toBe('예외');
    expect(judgeGate('southindian', 'day', known + 0.4)).toBe('예외');
    expect(judgeGate('southindian', 'day', known + 1)).toBe('개선');
    expect(judgeGate('southindian', 'day', 10)).toBe('개선');
    expect(judgeGate('southindian', 'day', known - 1)).toBe('위반');
  });

  it('예외 목록이 낡은 경우: 한 풀만 0 이상으로 바뀌어도 그 줄이 개선이다', () => {
    const known = KNOWN_INVERSIONS.barrierreef!;
    expect(judgeGate('barrierreef', 'day', 5)).toBe('개선');
    expect(judgeGate('barrierreef', 'mixed', known.mixed)).toBe('예외');
  });

  it('예외 목록에 없는 해역의 어종 가격을 크게 낮추면 그 전환이 위반이다', () => {
    const clean = gateRows().find(r => r.verdict === '통과')!;
    restore = applyOverride({ spots: { [clean.spot]: { priceMult: 0.1 } } });
    expect(gateRows().filter(r => r.spot === clean.spot).map(r => r.verdict)).toEqual(['위반', '위반']);
  });

  it('반례: 예외 목록의 해역이 알려진 값보다 나빠지면 위반이다(남인도양, 코모로 심해 배율 0.3)', () => {
    restore = applyOverride({ spots: { southindian: { priceMult: 0.3 }, comorodeep: { priceMult: 0.3 } } });
    const rows = gateRows();
    expect(rows.find(r => r.spot === 'southindian' && r.pool === 'day')!.verdict).toBe('위반');
  });
});
