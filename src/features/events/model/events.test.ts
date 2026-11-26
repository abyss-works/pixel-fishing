import { describe, expect, it } from 'vitest';
import { EVENT2_SETTLEMENT_RATES, EVENT_FISH } from '../../../game/content/eventFish';
import { newState } from '../../../game/rules/logic';
import type { EventsSnapshot, LiveEventSummary } from '../../../platform/api';
import {
  formatEventExpiryText,
  hasEventsAlert,
  remainingDaysText,
  selectEventChampionshipView,
  selectEventDrawView,
  selectEventList,
  selectEventTrioView,
} from './events';

const NOW = '2026-12-01T12:00:00.000Z';

const EV_TRIO: LiveEventSummary = {
  id: 'ev-trio',
  kind: 'trio',
  title: '삼총사를 낚아라',
  description: '세 마리를 모두 낚으면 자동 응모돼요.',
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2026-12-06T12:00:00.000Z',
  active: true,
  config: {},
};

const EV_CHAMP: LiveEventSummary = {
  id: 'ev-champ',
  kind: 'championship',
  title: '강태공 선수권 대회',
  description: '분지 호수에서 실력을 겨루세요.',
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2026-12-10T12:00:00.000Z',
  active: true,
  config: {},
};

const EV_DRAW: LiveEventSummary = {
  id: 'ev-draw',
  kind: 'draw',
  title: '천하제일 행운왕',
  description: '매일 운세 점수를 모아요.',
  startsAt: '2026-12-01T00:00:00.000Z',
  endsAt: '2026-12-06T12:00:00.000Z',
  active: true,
  config: {},
};

const SNAP: EventsSnapshot = {
  now: NOW,
  events: [EV_TRIO, EV_CHAMP, EV_DRAW],
  trio: {
    eventId: 'ev-trio',
    slots: [
      { fishId: 'mackerel', form: 'normal', completed: true, completedAt: NOW },
      { fishId: 'squid', form: 'normal', completed: false, completedAt: null },
      { fishId: 'sailfish', form: 'normal', completed: false, completedAt: null },
    ],
    completedAt: null,
    claimedAt: null,
    won: false,
    rewardPin: null,
    rewardExpiresAt: null,
  },
  championship: {
    eventId: 'ev-champ',
    score: 430,
    bestFishId: 'event-glaaki',
    bestFishScore: 400,
    catches: 5,
    dex: { 'event-glaaki': { normal: 1, variant: 0 } },
    hatsGranted: [],
    pendingGold: 1200,
    pendingFame: 8,
    rank: 5,
    top: [
      { rank: 1, userId: 'u1', nickname: '일등', score: 2000, me: false },
      { rank: 2, userId: 'u2', nickname: '이등', score: 1500, me: false },
      { rank: 3, userId: 'u3', nickname: '삼등', score: 1000, me: false },
      { rank: 4, userId: 'u4', nickname: '사등', score: 700, me: false },
    ],
  },
  draw: {
    eventId: 'ev-draw',
    totalScore: 185,
    attendedDays: 2,
    days: [
      { day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 },
      { day: '2026-12-02', kind: 'fish', index: 5, score: 88 },
      { day: '2026-12-03', kind: null, index: null, score: null },
    ],
    rank: 3,
    top: [
      { rank: 1, userId: 'u1', nickname: '운빨왕', score: 290, me: false },
      { rank: 2, userId: 'u2', nickname: '행운아', score: 240, me: false },
      { rank: 3, userId: 'me', nickname: '나야나', score: 185, me: true },
    ],
    won: false,
  },
};

describe('events 모델 셀렉터', () => {
  it('남은 일수와 만료 날짜 문구를 올바르게 만든다', () => {
    expect(remainingDaysText('2026-12-06T12:00:00.000Z', NOW)).toBe('5일 남음');
    expect(remainingDaysText('2026-12-01T10:00:00.000Z', NOW)).toBe('오늘 마감');
    expect(formatEventExpiryText('2026-12-31T14:59:59.000Z')).toBe('2026년 12월 31일까지');
  });

  it('hasEventsAlert는 계정 회원의 미수령 당첨이나 정산 가능 보상이 있을 때만 true다', () => {
    expect(hasEventsAlert(SNAP, 'account')).toBe(true);
    expect(hasEventsAlert(SNAP, 'guest')).toBe(false);
    const settledSnap: EventsSnapshot = {
      ...SNAP,
      championship: { ...SNAP.championship!, pendingGold: 0, pendingFame: 0 },
    };
    expect(hasEventsAlert(settledSnap, 'account')).toBe(false);
    expect(hasEventsAlert({
      ...settledSnap,
      trio: { ...SNAP.trio!, won: true, claimedAt: null, rewardPin: '123456789012' },
    }, 'account')).toBe(true);
  });

  it('selectEventList는 목록 카드 배지와 남은 일수, 알림점을 만든다', () => {
    const items = selectEventList(SNAP, 'account');
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      kind: 'trio',
      remainingText: '5일 남음',
      hasAlert: false,
      badges: [{ label: '1 / 3', tone: 'gold' }, { label: '진행 중', tone: 'accent' }],
    });
    expect(items[1]).toMatchObject({
      kind: 'championship',
      hasAlert: true,
      badges: [{ label: '5위', tone: 'accent' }, { label: '정산 가능', tone: 'gold' }],
    });
    expect(items[2]).toMatchObject({
      kind: 'draw',
      hasAlert: false,
      badges: [{ label: '3위', tone: 'accent' }, { label: '2일 출석', tone: 'gold' }],
    });
  });

  it('selectEventTrioView는 3슬롯 어종과 응모 및 당첨 상태를 조립한다', () => {
    const progress = selectEventTrioView(EV_TRIO, SNAP.trio, NOW);
    expect(progress.statusLabel).toBe('1 / 3');
    expect(progress.slots.map(s => s.name)).toEqual(['고등어', '심해 오징어', '돛새치']);
    expect(progress.slots[0].completed).toBe(true);

    const won = selectEventTrioView(EV_TRIO, {
      ...SNAP.trio!,
      completedAt: NOW,
      won: true,
      rewardPin: '1234567890123456',
      rewardExpiresAt: '2026-12-31T14:59:59.000Z',
    }, NOW);
    expect(won.statusLabel).toBe('당첨 확정');
    expect(won.rewardPin).toBe('1234567890123456');
    expect(won.expiryText).toBe('2026년 12월 31일까지');
  });

  it('selectEventChampionshipView는 2-1-3 시상대, 배 단계별 정산 단가, 9종 도감과 모자 진행도를 만든다', () => {
    const game = { ...newState(), boat: 3, location: { kind: 'region' as const, id: 'championship' as const } };
    const view = selectEventChampionshipView(EV_CHAMP, SNAP.championship, game, NOW, '내닉');
    expect(view.inEventZone).toBe(true);
    expect(view.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(view.rows.map(r => r.rank)).toEqual([4]);
    expect(view.myRow).toEqual({ rank: 5, nickname: '내닉', score: 430 });
    expect(view.idleRate).toBe(EVENT2_SETTLEMENT_RATES.idle[3]);
    expect(view.manualRate).toBe(EVENT2_SETTLEMENT_RATES.manual[3]);
    expect(view.fameRate).toBe(EVENT2_SETTLEMENT_RATES.fame);
    expect(view.dex).toHaveLength(EVENT_FISH.length);
    expect(view.dex.find(d => d.id === 'event-glaaki')?.normalCaught).toBe(true);
    expect(view.normalHat).toMatchObject({ count: 1, total: 9, owned: false });
    expect(view.variantHat).toMatchObject({ count: 0, total: 9, owned: false });
  });

  it('selectEventDrawView는 2-1-3 시상대와 일별 운세 점괘판 타일을 만든다', () => {
    const view = selectEventDrawView(EV_DRAW, SNAP.draw, NOW);
    expect(view.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(view.myRow).toEqual({ rank: 3, nickname: '나야나', score: 185 });
    expect(view.days).toHaveLength(3);
    expect(view.days[0]).toMatchObject({ label: '12/1', fortuneName: '만선 대길', score: 97, attended: true });
    expect(view.days[2]).toMatchObject({ label: '12/3', fortuneName: null, score: null, attended: false });
  });
});
