import { afterEach, describe, expect, it } from 'vitest';
import { applyOverride } from './flow/override';
import {
  FAME_RATIO_LIMIT, GATE_FROM_SPOT, GATE_POOLS, KNOWN_FAME_RATIO, KNOWN_INVERSIONS, KNOWN_TIME_ORDER, KNOWN_TIME_RANGE, PERFECT_LIMIT,
  REGION_ENTRY_TARGET, gateRows, judgeFameRatio, judgeGate, judgeOpening, judgePerfect, judgeTimeOrder, judgeTimeRange,
} from './gates';

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

describe('PERFECT 이상치 판정', () => {
  it('방치의 10배까지는 통과하고 넘으면 위반이다', () => {
    expect(PERFECT_LIMIT).toBe(10);
    expect(judgePerfect(7.37)).toBe('통과');
    expect(judgePerfect(10)).toBe('통과');
    expect(judgePerfect(10.01)).toBe('위반');
  });
});

describe('배 명성 대기 ÷ 골드 대기 판정', () => {
  it('1.3배 이하는 하한 없이 통과한다', () => {
    expect(FAME_RATIO_LIMIT).toBe(1.3);
    expect(judgeFameRatio('indian', 1.3)).toBe('통과');
    expect(judgeFameRatio('indian', 1.01)).toBe('통과');
    expect(judgeFameRatio('indian', 0)).toBe('통과');
  });

  it('1.3배를 넘으면 목록에 없는 전환은 위반이다', () => {
    expect(judgeFameRatio('indian', 1.33)).toBe('위반');
  });

  it('목록의 전환은 알려진 값과 같으면 예외, 좋아지면 개선, 나빠지면 위반이다', () => {
    expect(KNOWN_FAME_RATIO.southindian).toBe(1.33);
    expect(judgeFameRatio('southindian', 1.33)).toBe('예외');
    expect(judgeFameRatio('southindian', 1.3)).toBe('개선');
    expect(judgeFameRatio('southindian', 1.12)).toBe('개선');
    expect(judgeFameRatio('southindian', 1.4)).toBe('위반');
  });

  it('골드 대기가 없어 비율이 정해지지 않는 전환은 명성 대기가 없으면 통과, 있으면 위반이다', () => {
    expect(judgeFameRatio('indian', null, 0)).toBe('통과');
    expect(judgeFameRatio('indian', null, 1)).toBe('위반');
  });
});

describe('전환 시간 범위 판정', () => {
  it('지역 진입 전환의 목표는 인도양 3~4, 모잠비크 9~10, 용승대 25~27시간이다', () => {
    expect(REGION_ENTRY_TARGET).toEqual({ indian: [3, 4], madagascar: [9, 10], southatlantic: [25, 27] });
  });

  it('범위 안은 통과, 밖은 위반이다(경계 포함)', () => {
    expect(judgeTimeRange('x' as never, [3, 4], 3.5)).toBe('통과');
    expect(judgeTimeRange('x' as never, [3, 4], 3)).toBe('통과');
    expect(judgeTimeRange('x' as never, [3, 4], 4)).toBe('통과');
    expect(judgeTimeRange('x' as never, [3, 4], 1.3)).toBe('위반');
    expect(judgeTimeRange('x' as never, [3, 4], 4.5)).toBe('위반');
  });

  it('알려진 값 1.28시간(아래쪽): 2.50과 3.50은 개선, 1.00은 위반, 반대쪽 5.00도 위반이다', () => {
    expect(KNOWN_TIME_RANGE.indian).toBe(1.28);
    expect(judgeTimeRange('indian', [3, 4], 2.5)).toBe('개선');
    expect(judgeTimeRange('indian', [3, 4], 3.5)).toBe('개선');
    expect(judgeTimeRange('indian', [3, 4], 1.0)).toBe('위반');
    expect(judgeTimeRange('indian', [3, 4], 5.0)).toBe('위반');
    expect(judgeTimeRange('indian', [3, 4], 1.28)).toBe('예외');
  });

  it('목록의 전환은 알려진 값과 같으면 예외, 범위에 가까워지면 개선, 멀어지면 위반이다', () => {
    const known = KNOWN_TIME_RANGE.indian!;
    expect(known).toBeLessThan(3);
    expect(judgeTimeRange('indian', [3, 4], known)).toBe('예외');
    expect(judgeTimeRange('indian', [3, 4], known + 0.5)).toBe('개선');
    expect(judgeTimeRange('indian', [3, 4], 3.5)).toBe('개선');
    expect(judgeTimeRange('indian', [3, 4], known - 0.5)).toBe('위반');
  });
});

describe('전환 시간 순서 판정', () => {
  it('직전보다 줄지 않으면 통과하고 줄면 위반이다', () => {
    expect(judgeTimeOrder('x' as never, 16, 23)).toBe('위반');
    expect(judgeTimeOrder('x' as never, 23, 23)).toBe('통과');
    expect(judgeTimeOrder('x' as never, 25, 23)).toBe('통과');
  });

  it('목록의 전환은 줄어든 폭이 알려진 값과 같으면 예외이고 폭이 작아지면 개선, 커지면 위반이다', () => {
    const known = KNOWN_TIME_ORDER.sthelena!;
    expect(known).toBeGreaterThan(0);
    expect(judgeTimeOrder('sthelena', 23 - known, 23)).toBe('예외');
    expect(judgeTimeOrder('sthelena', 23 - known + 1, 23)).toBe('개선');
    expect(judgeTimeOrder('sthelena', 23, 23)).toBe('개선');
    expect(judgeTimeOrder('sthelena', 23 - known - 1, 23)).toBe('위반');
  });
});

describe('최초 10분 도달 판정', () => {
  it('600초 이하는 통과하고 넘으면 위반이다', () => {
    expect(judgeOpening(599)).toBe('통과');
    expect(judgeOpening(600)).toBe('통과');
    expect(judgeOpening(601)).toBe('위반');
    expect(judgeOpening(null)).toBe('위반');
  });
});
