import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../../src/game/content/spots';
import { entryLevel, rates } from '../model';
import { OFFSETS, earlyEntry, huntCost, incomeByOffset, returnTrips } from './exception';

describe('진입 레벨 대비 수입', () => {
  const rows = incomeByOffset('idle');
  const row = (id: string) => rows.find(r => r.spot === id)!;
  const cell = (id: string, offset: number) => row(id).cells[OFFSETS.indexOf(offset as never)]!;

  it('오프셋은 -4부터 +4까지이고 해역마다 한 행이다', () => {
    expect(OFFSETS).toEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(rows.map(r => r.spot)).toEqual(SPOTS.map(s => s.id));
  });

  it('레벨 1 미만 칸은 비어 있다', () => {
    expect(row('pond').cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(row('pond').cells[4]).not.toBeNull();
  });

  it('진입 칸은 모델의 방치 수입과 같고 비율이 1이다', () => {
    const c = cell('sea', 0);
    expect(c.level).toBe(entryLevel('sea'));
    expect(c.goldPerHour).toBe(rates('sea', entryLevel('sea'), 'idle').goldPerHour);
    expect(c.ratioToEntry).toBe(1);
  });

  it('미달 구간은 수입과 전설 확률이 낮고 사이클이 길다', () => {
    for (let o = -4; o < 0; o++) {
      const a = cell('sthelena', o), b = cell('sthelena', o + 1);
      expect(a.goldPerHour, `${o}`).toBeLessThan(b.goldPerHour);
      expect(a.legendPct, `${o}`).toBeLessThan(b.legendPct);
      expect(a.cycleSec, `${o}`).toBeGreaterThan(b.cycleSec);
      expect(a.ratioToEntry).toBeLessThan(1);
    }
  });

  it('초과 구간은 수입이 줄지 않는다', () => {
    for (let o = 0; o < 4; o++) expect(cell('sthelena', o + 1).goldPerHour).toBeGreaterThanOrEqual(cell('sthelena', o).goldPerHour);
  });

  it('수동 축은 미달이면 무판정, 진입 이상이면 GOOD이다', () => {
    const manual = incomeByOffset('manual').find(r => r.spot === 'sea')!;
    const at = (o: number) => manual.cells[OFFSETS.indexOf(o as never)]!;
    expect(at(-1).goldPerHour).toBe(rates('sea', entryLevel('sea') - 1, 'normal').goldPerHour);
    expect(at(0).goldPerHour).toBe(rates('sea', entryLevel('sea'), 'good').goldPerHour);
  });
});

describe('조기 진입', () => {
  const rows = earlyEntry('idle');

  it('같은 배로 열리는 이전 해역이 있는 해역만 나오고 코론 -1은 드래곤 홀과 비교한다', () => {
    const r = rows.find(x => x.spot === 'coron' && x.offset === -1)!;
    expect(r.alt).toBe('dragonhole');
    expect(r.level).toBe(entryLevel('coron') - 1);
    expect(rows.some(x => x.spot === 'sea')).toBe(false);
    expect(rows.some(x => x.spot === 'dragonhole')).toBe(false);
  });

  it('배가 필요한 해역은 기본 상수에서 조기 진입이 같은 레벨의 이전 해역보다 수입이 적다', () => {
    const sea = rows.filter(r => SPOTS.find(s => s.id === r.spot)!.boatTier > 0);
    expect(sea.length).toBeGreaterThan(0);
    for (const r of sea) expect(r.ratio, `${r.spot} ${r.offset}`).toBeLessThan(1);
  });

  it('비교 해역은 요구 파워를 채운 이전 해역뿐이다', () => {
    for (const r of rows) {
      const alt = SPOTS.find(s => s.id === r.alt)!;
      expect(SPOTS.findIndex(s => s.id === r.alt)).toBeLessThan(SPOTS.findIndex(s => s.id === r.spot));
      expect(alt.powerReq ?? 0).toBeLessThanOrEqual(10 + (r.level - 1) * 5);
    }
  });
});

describe('낮은 지역으로 돌아옴', () => {
  const trips = returnTrips('idle');

  it('마지막 해역의 진입 레벨과 +4를 비교하고 마지막 해역이 기준 1이다', () => {
    const lastId = SPOTS.at(-1)!.id;
    expect(trips.map(t => t.level)).toEqual([entryLevel(lastId), entryLevel(lastId) + 4]);
    for (const t of trips) {
      expect(t.rows.find(r => r.spot === lastId)!.ratioToLast).toBe(1);
      expect(t.rows.find(r => r.spot === 'sea')!.ratioToLast).toBeLessThan(0.2);
    }
  });
});

describe('네임드 토벌 비용', () => {
  const rows = huntCost('idle');

  it('보상과 조우 시간, 줄어드는 수입을 구역마다 낸다', () => {
    expect(rows.map(r => r.zone)).toEqual(['pacific', 'seasia', 'indian', 'madagascar', 'southatlantic']);
    const pacific = rows[0];
    expect(pacific.reward).toBe(400000);
    expect(pacific.hours).toBeGreaterThan(0);
    expect(pacific.loss).toBeGreaterThan(0);
    expect(pacific.lossOverReward).toBeCloseTo(pacific.loss / pacific.reward, 12);
  });

  it('마지막 해역과 같은 구역에서는 줄어드는 수입이 보상에 비해 작다', () => {
    const own = rows.find(r => r.zone === 'southatlantic')!;
    expect(own.lossOverReward).toBeLessThan(0.05);
  });
});
