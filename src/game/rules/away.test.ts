// 방치 결과 보고 — 비운 사이의 행동 기록을 요약하고, 보여 줄지와 다음 조언을 판정한다
import { describe, expect, it } from 'vitest';
import { awayReportDue, awayTips, awayWindow, summarizeAway } from './away';
import type { AwayEvent } from './away';
import { BOATS, FISH, MAX_BOAT, RARITY, newState } from './logic';

const T0 = '2026-11-05T00:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const HOUR = 3_600_000;
const W = { from: T0, to: at(120), awayMs: 2 * HOUR };

const catchAt = (min: number, fishId: string, over: Record<string, unknown> = {}): AwayEvent => ({
  type: 'catch', at: at(min),
  payload: { uid: `u${min}`, fishId, form: 'normal', size: 10, judgment: 'auto', spot: 'sea', isNew: false, ...over },
});
const fish = (id: string) => FISH.find(f => f.id === id)!;

describe('awayReportDue', () => {
  it('2분 이상 비웠을 때만 결과 카드를 띄운다', () => {
    expect(awayReportDue(2 * 60_000 - 1)).toBe(false);
    expect(awayReportDue(2 * 60_000)).toBe(true);
  });
});

describe('awayWindow', () => {
  it('지금에서 비운 시간만큼 거슬러 올라간 기간이다', () => {
    expect(awayWindow(2 * HOUR, at(120))).toEqual(W);
  });

  it('기간은 행동 기록 보관 기간(7일)을 넘지 않는다', () => {
    const w = awayWindow(30 * 24 * HOUR, at(120))!;
    expect(w.awayMs).toBe(7 * 24 * HOUR);
    expect(Date.parse(w.to) - Date.parse(w.from)).toBe(7 * 24 * HOUR);
  });

  it('0 이하나 숫자가 아닌 값은 기간이 없다', () => {
    expect(awayWindow(0, T0)).toBeNull();
    expect(awayWindow(-5, T0)).toBeNull();
    expect(awayWindow(Number.NaN, T0)).toBeNull();
  });
});

describe('summarizeAway', () => {
  it('행동 기록이 없으면 모든 값이 0이고 가방은 차지 않았다', () => {
    const s = summarizeAway([], W);
    expect(s).toMatchObject({
      catches: 0, value: 0, fame: 0, perHour: { catches: 0, value: 0, fame: 0 },
      variants: { count: 0, share: 0 }, newFish: [], released: { count: 0, value: 0 },
      bagFullAfterMs: null, spot: null,
    });
    expect(s.grades.every(g => g.count === 0 && g.share === 0)).toBe(true);
  });

  it('잡은 수·판매 가치·명성과 시간당 효율을 센다', () => {
    const events = [
      catchAt(1, 'mackerel'), catchAt(2, 'mackerel'), catchAt(3, 'seabream'),
      catchAt(4, 'mackerel', { form: 'variant' }),
    ];
    const s = summarizeAway(events, W);
    const m = fish('mackerel'), b = fish('seabream');
    expect(s.catches).toBe(4);
    expect(s.value).toBe(m.price * 2 + b.price + m.price * 2);
    expect(s.fame).toBe(RARITY.common.fame * 3 + RARITY.rare.fame);
    expect(s.perHour).toEqual({ catches: 2, value: s.value / 2, fame: s.fame / 2 });
  });

  it('등급별 수와 비율, 돌연변이 수와 비율을 센다', () => {
    const events = [catchAt(1, 'mackerel'), catchAt(2, 'mackerel', { form: 'variant' }), catchAt(3, 'seabream'), catchAt(4, 'hairtail')];
    const s = summarizeAway(events, W);
    expect(s.grades.map(g => g.rarity)).toEqual(['common', 'rare', 'epic', 'legendary']);
    expect(s.grades.find(g => g.rarity === 'common')).toEqual({ rarity: 'common', count: 3, share: 0.75 });
    expect(s.grades.find(g => g.rarity === 'rare')).toEqual({ rarity: 'rare', count: 1, share: 0.25 });
    expect(s.variants).toEqual({ count: 1, share: 0.25 });
  });

  it('새 도감은 폼별 한 줄이고 그 폼의 기간 내 가장 큰 크기를 붙인다', () => {
    const events = [
      catchAt(1, 'seabream', { isNew: true, size: 30 }), catchAt(2, 'seabream', { size: 45 }),
      catchAt(3, 'mackerel', { form: 'variant', isNew: true, size: 20 }), catchAt(4, 'mackerel', { size: 99 }),
    ];
    expect(summarizeAway(events, W).newFish).toEqual([
      { fishId: 'seabream', form: 'normal', rarity: 'rare', maxSize: 45 },
      { fishId: 'mackerel', form: 'variant', rarity: 'common', maxSize: 20 },
    ]);
  });

  it('첫 자동 방생 시각이 가방이 찬 시각이고, 방생한 수와 가치를 센다', () => {
    const events: AwayEvent[] = [
      catchAt(1, 'mackerel'),
      { type: 'autoRelease', at: at(92), payload: { uids: ['x1'], reason: 'bag-full', fish: [{ uid: 'x1', fishId: 'mackerel', form: 'normal' }] } },
      { type: 'autoRelease', at: at(95), payload: { uids: ['x2'], reason: 'bag-full', fish: [{ uid: 'x2', fishId: 'seabream', form: 'variant' }] } },
    ];
    const s = summarizeAway(events, W);
    expect(s.bagFullAfterMs).toBe(92 * 60_000);
    expect(s.released).toEqual({ count: 2, value: fish('mackerel').price + fish('seabream').price * 2 });
  });

  it('어종 정보가 없는 예전 자동 방생은 수만 센다', () => {
    const s = summarizeAway([{ type: 'autoRelease', at: at(5), payload: { uids: ['a', 'b'], reason: 'bag-full' } }], W);
    expect(s.released).toEqual({ count: 2, value: 0 });
    expect(s.bagFullAfterMs).toBe(5 * 60_000);
  });

  it('가장 많이 잡은 수역을 고른다', () => {
    const events = [catchAt(1, 'mackerel'), catchAt(2, 'mackerel', { spot: 'deep' }), catchAt(3, 'mackerel', { spot: 'deep' })];
    expect(summarizeAway(events, W).spot).toBe('deep');
  });

  it('도감에 없는 어종의 캐치는 세지 않는다', () => {
    expect(summarizeAway([catchAt(1, 'no-such-fish')], W).catches).toBe(0);
  });
});

describe('awayTips', () => {
  const state = (fame: number, boat: number) => ({ ...newState(), fame, boat });

  it('가방이 찼으면 찬 시각을 담아 판매를 권한다', () => {
    const s = { ...summarizeAway([], W), bagFullAfterMs: 92 * 60_000 };
    expect(awayTips(s, state(0, MAX_BOAT))).toEqual([{ kind: 'sell', fullAfterMs: 92 * 60_000 }]);
  });

  it('다음 배의 명성 조건까지 남은 양과 지금 속도의 예상 시간을 준다', () => {
    const s = { ...summarizeAway([], W), fame: 1000 }; // 2시간에 1000 → 시간당 500
    const next = BOATS[1];
    expect(awayTips(s, state(next.fameReq - 250, 1))).toEqual([
      { kind: 'fame', boat: next.tier, left: 250, etaMs: HOUR / 2 },
    ]);
  });

  it('이번에 명성을 얻지 못했으면 예상 시간 없이 남은 양만 준다', () => {
    const s = summarizeAway([], W);
    expect(awayTips(s, state(0, 1))).toEqual([{ kind: 'fame', boat: BOATS[1].tier, left: BOATS[1].fameReq, etaMs: null }]);
  });

  it('다음 배의 명성을 이미 채웠거나 마지막 배를 가졌으면 명성 조언은 없다', () => {
    const s = { ...summarizeAway([], W), fame: 100 };
    expect(awayTips(s, state(BOATS[1].fameReq, 1))).toEqual([]);
    expect(awayTips(s, state(0, BOATS.length))).toEqual([]);
  });
});
