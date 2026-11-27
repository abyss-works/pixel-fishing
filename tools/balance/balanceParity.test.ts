import { describe, expect, it } from 'vitest';
import { SPOTS } from '../../src/game/content/spots';
import { evReport } from './flow/ev';
import { entryLevel, plateauLevel, rates, spotAxisHourlyGold } from './model';

describe('밸런스 도구와 통합 EV 엔진 일치', () => {
  it('모든 해역의 evReport 진입 EV가 spotAxisHourlyGold의 idleWorst와 같다', () => {
    const report = evReport();
    SPOTS.forEach((spot, i) => {
      const ev = spotAxisHourlyGold(spot.id);
      expect(report.spots[i].entryEv, spot.id).toBeCloseTo(ev.goldPerHour.idleWorst, 10);
    });
  });

  it('모든 해역의 진입 레벨 방치 수입이 spotAxisHourlyGold의 idleWorst와 같다', () => {
    for (const spot of SPOTS) {
      const ev = spotAxisHourlyGold(spot.id);
      expect(rates(spot.id, entryLevel(spot.id), 'idle').goldPerHour, spot.id).toBeCloseTo(ev.goldPerHour.idleWorst, 10);
    }
  });

  it('모든 해역의 플래토 레벨 방치 수입이 spotAxisHourlyGold의 idleBest와 같다', () => {
    for (const spot of SPOTS) {
      const ev = spotAxisHourlyGold(spot.id);
      expect(rates(spot.id, plateauLevel(spot.id), 'idle').goldPerHour, spot.id).toBeCloseTo(ev.goldPerHour.idleBest, 10);
    }
  });

  it('남인도양에서 모잠비크 진입 시간당 EV 증가율이 evReport의 growth와 일치한다', () => {
    const report = evReport({ growth: true });
    const row = report.growth!.find(g => g.from === 'southindian' && g.to === 'mozstrait')!;
    const fromEv = spotAxisHourlyGold('southindian').goldPerHour.idleWorst;
    const toEv = spotAxisHourlyGold('mozstrait').goldPerHour.idleWorst;
    expect(toEv / fromEv - 1).toBeCloseTo(row.growth, 12);
  });
});
