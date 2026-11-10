import { afterEach, describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { SPEC_MARGIN } from '../model';
import { REGION_ENTRY_TARGET, TIME_GATE_FROM_SPOT } from '../gates';
import { applyOverride } from './override';
import { gatesReport, verdictCounts } from './gateReport';

const opts = { maxDays: 365, legendAts: [10, 15, 20] };
const reef = SPOTS.findIndex(s => s.id === TIME_GATE_FROM_SPOT);

describe('게이트 보고', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { restore?.(); restore = null; });

  it('현재 값에서 개선과 위반이 0건이고 네 가지 판정이 모두 나온다', () => {
    const c = verdictCounts(gatesReport(opts));
    expect(c['개선']).toBe(0);
    expect(c['위반']).toBe(0);
    expect(c['통과']).toBeGreaterThan(0);
    expect(c['예외']).toBeGreaterThan(0);
  });

  it('PERFECT 이상치는 모든 해역의 최소 스펙과 여유 스펙마다 한 줄이고 현재 값은 모두 통과다', () => {
    const rows = gatesReport(opts).perfect;
    expect(rows).toHaveLength(SPOTS.length * 2);
    expect(rows.map(r => r.verdict)).toEqual(rows.map(() => '통과'));
    expect(rows.find(r => r.spot === 'sthelena' && r.margin === SPEC_MARGIN)).toBeDefined();
  });

  it('명성 비율은 리프 이후 배를 사는 전환만 보고 남인도양 전환은 예외다', () => {
    const rows = gatesReport(opts).fame;
    expect(rows.map(r => r.to)).toEqual(SPOTS.slice(reef + 1).map(s => s.id).filter(id => rows.some(r => r.to === id)));
    expect(rows.every(r => SPOTS.findIndex(s => s.id === r.to) > reef)).toBe(true);
    expect(rows.find(r => r.to === 'southindian')).toMatchObject({ verdict: '예외' });
    expect(rows.find(r => r.to === 'southindian')!.ratio).toBeCloseTo(1.33, 2);
  });

  it('배를 사는 전환만 명성 비율을 판정한다: 배가 없는 전환은 행이 없다', () => {
    const to = gatesReport(opts).fame.map(r => r.to);
    expect(to).toEqual(['indian', 'southindian', 'mozstrait', 'benguela']);
    for (const noBoat of ['comorodeep', 'sthelena', 'coron']) expect(to).not.toContain(noBoat);
  });

  describe('시뮬레이션이 끝나지 않을 때', () => {
    const short = gatesReport({ ...opts, maxDays: 7 });

    it('닿지 못한 전환은 판정에서 빠지지 않고 위반이며 닿은 전환은 그대로다', () => {
      expect(short.time).toHaveLength(SPOTS.length - 1);
      const last = short.time.at(-1)!;
      expect(last.to).toBe('sthelena');
      expect(last.hours).toBeNull();
      expect(last.days).toBeNull();
      expect(last.orderVerdict).toBe('위반');
      expect(short.time.find(r => r.to === 'indian')!.hours).not.toBeNull();
    });

    it('닿지 못한 지역 진입 전환은 범위 판정이, 배를 사는 전환은 명성 비율 판정이 위반이다', () => {
      const t = gatesReport({ ...opts, maxDays: 3 });
      const benguela = t.time.find(r => r.to === 'benguela')!;
      expect(benguela.hours).toBeNull();
      expect(benguela.rangeVerdict).toBe('위반');
      expect(t.fame.find(r => r.to === 'benguela')).toMatchObject({ ratio: null, goldWait: null, verdict: '위반' });
      expect(t.fame.map(r => r.to)).toEqual(['indian', 'southindian', 'mozstrait', 'benguela']);
    });

    it('집계의 위반이 0보다 크다', () => {
      expect(verdictCounts(short)['위반']).toBeGreaterThan(0);
    });
  });

  it('최초 10분 도달은 판정마다 보장 번호 후보 중 가장 느린 값으로 재고 현재 값은 통과다', () => {
    const rows = gatesReport(opts).opening;
    expect(rows.map(r => r.judgment)).toEqual(['normal', 'good']);
    for (const r of rows) {
      expect(r.seconds).not.toBeNull();
      expect(r.seconds!).toBeLessThanOrEqual(600);
      expect(r.verdict).toBe('통과');
    }
  });

  describe('전환 시간', () => {
    const rows = gatesReport(opts).time;

    it('전환마다 한 줄이고 리프까지의 전환은 판정 없이 시간만 낸다', () => {
      expect(rows).toHaveLength(SPOTS.length - 1);
      for (const r of rows.slice(0, reef)) {
        expect(r.kind).toBe('observe');
        expect(r.rangeVerdict).toBeNull();
        expect(r.orderVerdict).toBeNull();
        expect(r.hours!).toBeGreaterThanOrEqual(0);
      }
    });

    it('범위 판정은 지역 진입 전환 세 개에만 있다', () => {
      const judged = rows.filter(r => r.rangeVerdict !== null);
      expect(judged.map(r => r.to)).toEqual(['indian', 'mozstrait', 'benguela']);
      expect(judged.map(r => r.range)).toEqual(Object.values(REGION_ENTRY_TARGET));
      expect(judged.every(r => r.kind === 'entry')).toBe(true);
    });

    it('같은 지역 안의 전환은 범위를 판정하지 않고 요구 파워 간격 둘을 함께 낸다', () => {
      const inner = rows.filter(r => r.kind === 'inner');
      expect(inner.map(r => r.to)).toEqual(['southindian', 'comorodeep', 'sthelena']);
      const power = (id: string) => SPOTS.find(s => s.id === id)!.powerReq ?? 0;
      for (const r of inner) {
        expect(r.rangeVerdict).toBeNull();
        expect(r.range).toBeNull();
        expect(r.powerGap).toBe(power(r.to) - power(r.from));
        expect(r.orderVerdict).not.toBeNull();
      }
      expect(inner[0].entryPowerGap).toBe(power('indian') - power('barrierreef'));
      expect(inner[1].entryPowerGap).toBe(power('mozstrait') - power('southindian'));
      expect(inner[2].entryPowerGap).toBe(power('benguela') - power('comorodeep'));
    });

    it('순서 판정은 리프 이후의 두 번째 전환부터 있고 세인트헬레나 전환이 예외다', () => {
      const after = rows.slice(reef);
      expect(after[0].orderVerdict).toBeNull();
      expect(after[0].prevHours).toBeNull();
      for (const r of after.slice(1)) expect(r.orderVerdict, r.to).not.toBeNull();
      expect(after.find(r => r.to === 'sthelena')).toMatchObject({ orderVerdict: '예외' });
    });

    it('범위 밖 지역 진입 전환 세 개와 순서 위반 한 개가 알려진 예외다', () => {
      expect(rows.filter(r => r.rangeVerdict === '예외').map(r => r.to)).toEqual(['indian', 'mozstrait', 'benguela']);
      expect(rows.filter(r => r.orderVerdict === '예외').map(r => r.to)).toEqual(['sthelena']);
    });

    it('일수는 전환 시간 ÷ 8이다', () => {
      for (const r of rows) expect(r.days).toBeCloseTo(r.hours! / 8, 12);
    });
  });

  it('반례: 인도양 진입 전환이 지금보다 더 빨라지면 범위 판정이 위반이다', () => {
    restore = applyOverride({ spots: { barrierreef: { priceMult: 3 } } });
    const r = gatesReport(opts).time.find(x => x.to === 'indian')!;
    expect(r.hours!).toBeLessThan(1.27);
    expect(r.rangeVerdict).toBe('위반');
  });
});
