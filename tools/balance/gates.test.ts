import { afterEach, describe, expect, it } from 'vitest';
import { applyOverride } from './flow/override';
import { GATE_FROM_SPOT, KNOWN_INVERSIONS, gateRows } from './gates';

describe('이동 직후 수입 게이트', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('현재 값에서는 위반이 없고 알려진 역전만 예외로 나온다', () => {
    const rows = gateRows();
    expect(rows.filter(r => r.verdict === '위반')).toEqual([]);
    const exceptions = rows.filter(r => r.verdict === '예외');
    expect(new Set(exceptions.map(r => r.spot))).toEqual(new Set(Object.keys(KNOWN_INVERSIONS)));
    for (const r of exceptions) expect(r.diff, `${r.spot} ${r.pool}`).toBeCloseTo(KNOWN_INVERSIONS[r.spot]![r.pool], 0);
  });

  it('태평양부터 마지막 해역까지 전환마다 낮 풀과 낮밤 혼합 두 줄이다', () => {
    const rows = gateRows();
    expect(rows[0].spot).toBe(GATE_FROM_SPOT);
    expect(rows.filter(r => r.spot === rows[0].spot).map(r => r.pool)).toEqual(['day', 'mixed']);
    for (const r of rows) expect(r.diff).toBeCloseTo(r.after - r.before, 6);
  });

  it('예외 목록에 없는 해역의 어종 가격을 크게 낮추면 그 전환이 위반이다', () => {
    const clean = gateRows().find(r => r.verdict === '통과')!;
    restore = applyOverride({ spots: { [clean.spot]: { priceMult: 0.1 } } });
    const bad = gateRows().filter(r => r.spot === clean.spot);
    expect(bad.map(r => r.verdict)).toEqual(['위반', '위반']);
  });
});
