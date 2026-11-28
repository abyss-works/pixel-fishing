import { describe, expect, it } from 'vitest';
import { EVENT2_SETTLEMENT_RATES, EVENT_FISH } from '../../../game/content/eventFish';
import { fishById } from '../../../game/content/fish';
import { newState } from '../../../game/rules/logic';
import type { EventsSnapshot, LiveEventSummary } from '../../../platform/api';
import {
  eventLifecycleStatus,
  formatEventExpiryText,
  formatFishHabitat,
  hasActiveEvents,
  hasEventsAlert,
  isEventLiveNow,
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

  it('hasEventsAlert는 계정 회원의 미수령 당첨(교환권 확정)이나 정산 가능 보상이 있을 때만 true다', () => {
    expect(hasEventsAlert(SNAP, 'account')).toBe(true);
    expect(hasEventsAlert(SNAP, 'guest')).toBe(false);
    const settledSnap: EventsSnapshot = {
      ...SNAP,
      championship: { ...SNAP.championship!, pendingGold: 0, pendingFame: 0 },
    };
    expect(hasEventsAlert(settledSnap, 'account')).toBe(false);
    // 트리오 3종 달성 후 추첨 대기 상태(won만 true이고 rewardPin이 없음)는 빨간 점을 켜지 않는다
    expect(hasEventsAlert({
      ...settledSnap,
      trio: { ...SNAP.trio!, completedAt: NOW, won: true, claimedAt: null, rewardPin: null },
    }, 'account')).toBe(false);
    // 실제 추첨 당첨(rewardPin 발급) + 미수령 상태만 true다
    expect(hasEventsAlert({
      ...settledSnap,
      trio: { ...SNAP.trio!, won: true, claimedAt: null, rewardPin: '123456789012' },
    }, 'account')).toBe(true);
    // 행운왕은 참여·당첨 상태만으로 알림점을 켜지 않는다
    expect(hasEventsAlert({
      ...settledSnap,
      draw: { ...SNAP.draw!, won: true },
    }, 'account')).toBe(false);
  });

  it('isEventLiveNow와 hasActiveEvents는 active와 시작·종료 시각 구간을 함께 판정한다', () => {
    const nowMs = Date.parse(NOW);
    const upcoming: LiveEventSummary = {
      ...EV_TRIO,
      id: 'ev-upcoming',
      startsAt: '2026-12-02T00:00:00.000Z',
      endsAt: '2026-12-08T00:00:00.000Z',
      active: true,
    };
    const endedByTime: LiveEventSummary = {
      ...EV_CHAMP,
      id: 'ev-ended',
      startsAt: '2026-11-20T00:00:00.000Z',
      endsAt: NOW,
      active: true,
    };
    const inactive: LiveEventSummary = { ...EV_DRAW, id: 'ev-inactive', active: false };

    expect(isEventLiveNow(EV_TRIO, nowMs)).toBe(true);
    expect(isEventLiveNow(upcoming, nowMs)).toBe(false);
    expect(isEventLiveNow(endedByTime, nowMs)).toBe(false);
    expect(isEventLiveNow(inactive, nowMs)).toBe(false);

    expect(eventLifecycleStatus(upcoming, nowMs)).toBe('upcoming');
    expect(eventLifecycleStatus(EV_TRIO, nowMs)).toBe('active');
    expect(eventLifecycleStatus(endedByTime, nowMs)).toBe('ended');
    expect(eventLifecycleStatus(inactive, nowMs)).toBe('ended');

    const nonLiveSnap: EventsSnapshot = {
      now: NOW,
      events: [upcoming, endedByTime, inactive],
      trio: null,
      championship: null,
      draw: null,
    };
    expect(hasActiveEvents(null)).toBe(false);
    expect(hasActiveEvents(nonLiveSnap)).toBe(false);
    expect(hasActiveEvents(SNAP)).toBe(true);

    const list = selectEventList(nonLiveSnap, 'account');
    expect(list[0].badges).toEqual([{ label: '진행 예정', tone: 'dim' }]);
    expect(list[1].badges).toEqual([{ label: '종료', tone: 'dim' }]);
    expect(list[2].badges).toEqual([{ label: '종료', tone: 'dim' }]);
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

  it('formatFishHabitat는 가운뎃점 없이 구역과 수역, 밤 조건을 조합한다', () => {
    expect(formatFishHabitat(fishById('salmon') ?? null)).toBe('마을 강');
    expect(formatFishHabitat(fishById('yellowtail') ?? null)).toBe('태평양 연안');
    expect(formatFishHabitat(fishById('squid') ?? null)).toBe('태평양 (마리아나 해구)');
    expect(formatFishHabitat(fishById('sailfish') ?? null)).toBe('동남아 (드래곤 홀)');
    expect(formatFishHabitat(fishById('frostnight') ?? null)).toBe('남인도양 (밤)');
    expect(formatFishHabitat(fishById('moonglow') ?? null)).toBe('동남아 (드래곤 홀, 밤)');
    expect(formatFishHabitat(null)).toBe('');
  });

  it('selectEventTrioView는 3슬롯 어종과 출현 해역, 응모 및 당첨 상태를 조립한다', () => {
    const defaultView = selectEventTrioView(EV_TRIO, null, NOW);
    expect(defaultView.slots.map(s => s.name)).toEqual(['연어', '방어', '참치']);
    expect(defaultView.slots.map(s => s.habitatLabel)).toEqual([
      '마을 강',
      '태평양 연안',
      '태평양 연안',
    ]);

    const progress = selectEventTrioView(EV_TRIO, SNAP.trio, NOW);
    expect(progress.statusLabel).toBe('1 / 3');
    expect(progress.slots.map(s => s.name)).toEqual(['고등어', '심해 오징어', '돛새치']);
    expect(progress.slots.map(s => s.habitatLabel)).toEqual([
      '태평양 연안',
      '태평양 (마리아나 해구)',
      '동남아 (드래곤 홀)',
    ]);
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

  it('selectEventChampionshipView는 2-1-3 시상대(빈 자리 포함), 배 단계별 정산 단가, 9종 도감과 모자 진행도를 만든다', () => {
    const game = { ...newState(), boat: 3, location: { kind: 'region' as const, id: 'championship' as const } };
    const view = selectEventChampionshipView(EV_CHAMP, SNAP.championship, game, NOW, '내닉');
    expect(view.inEventZone).toBe(true);
    expect(view.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(view.podium.map(p => p.entry?.nickname)).toEqual(['이등', '일등', '삼등']);
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

  it('시상대는 참여자가 0명·1명·2명이어도 항상 [2, 1, 3] 3슬롯을 반환하고 빈 자리는 entry: null로 둔다', () => {
    const emptyView = selectEventChampionshipView(EV_CHAMP, null, newState(), NOW);
    expect(emptyView.podium).toEqual([
      { place: 2, entry: null },
      { place: 1, entry: null },
      { place: 3, entry: null },
    ]);

    const oneView = selectEventChampionshipView(EV_CHAMP, {
      ...SNAP.championship!,
      top: [{ rank: 1, userId: 'u1', nickname: '혼자일등', score: 900, me: true }],
      rank: 1,
    }, newState(), NOW);
    expect(oneView.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(oneView.podium[0].entry).toBeNull();
    expect(oneView.podium[1].entry).toMatchObject({ place: 1, nickname: '혼자일등', score: 900, me: true });
    expect(oneView.podium[2].entry).toBeNull();

    const twoView = selectEventDrawView(EV_DRAW, {
      ...SNAP.draw!,
      top: [
        { rank: 1, userId: 'u1', nickname: '일등', score: 300, me: false },
        { rank: 2, userId: 'u2', nickname: '이등', score: 200, me: false },
      ],
    }, NOW);
    expect(twoView.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(twoView.podium[0].entry).toMatchObject({ place: 2, nickname: '이등' });
    expect(twoView.podium[1].entry).toMatchObject({ place: 1, nickname: '일등' });
    expect(twoView.podium[2].entry).toBeNull();
  });

  it('selectEventDrawView는 KST 04:00 경계로 전체 기간 타일을 생성해 병합하고 status를 부여한다', () => {
    const fiveDayEv: LiveEventSummary = {
      ...EV_DRAW,
      // KST 2026-12-01 04:00 ~ 2026-12-06 04:00 (반열린 구간: 12/1~12/5 5일)
      startsAt: '2026-11-30T19:00:00.000Z',
      endsAt: '2026-12-05T19:00:00.000Z',
    };
    const midNow = '2026-12-03T12:00:00.000Z';
    const view = selectEventDrawView(fiveDayEv, {
      ...SNAP.draw!,
      days: [
        { day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 },
        { day: '2026-12-03', kind: 'fish', index: 5, score: 88 },
      ],
    }, midNow);
    expect(view.podium.map(p => p.place)).toEqual([2, 1, 3]);
    expect(view.myRow).toEqual({ rank: 3, nickname: '나야나', score: 185 });
    expect(view.days).toHaveLength(5);
    expect(view.days.map(d => [d.day, d.status])).toEqual([
      ['2026-12-01', 'attended'],
      ['2026-12-02', 'missed'],
      ['2026-12-03', 'attended'],
      ['2026-12-04', 'upcoming'],
      ['2026-12-05', 'upcoming'],
    ]);
    expect(view.days[0]).toMatchObject({ label: '12/1', fortuneName: '만선 대길', score: 97, attended: true, status: 'attended' });
    expect(view.days[1]).toMatchObject({ label: '12/2', fortuneName: null, score: null, attended: false, status: 'missed' });
    expect(view.days[3]).toMatchObject({ label: '12/4', fortuneName: null, score: null, attended: false, status: 'upcoming' });

    // 시작·종료 시각이 유효하지 않은 픽스처는 기존 state.days 폴백을 유지한다
    const fallbackView = selectEventDrawView({ ...EV_DRAW, startsAt: '', endsAt: '' }, SNAP.draw, NOW);
    expect(fallbackView.days).toHaveLength(3);
    expect(fallbackView.days[2]).toMatchObject({ label: '12/3', status: 'upcoming', attended: false });
  });

  it('selectEventDrawView는 당일 미출석 칸을 upcoming으로 분류하고 config.days를 우선 반영한다', () => {
    const fiveDayEv: LiveEventSummary = {
      ...EV_DRAW,
      startsAt: '2026-11-30T19:00:00.000Z',
      endsAt: '2026-12-05T19:00:00.000Z',
    };
    const midNow = '2026-12-03T12:00:00.000Z';
    const todayUnattended = selectEventDrawView(fiveDayEv, {
      ...SNAP.draw!,
      days: [{ day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 }],
    }, midNow);
    expect(todayUnattended.days.map(d => [d.day, d.status])).toEqual([
      ['2026-12-01', 'attended'],
      ['2026-12-02', 'missed'],
      ['2026-12-03', 'upcoming'],
      ['2026-12-04', 'upcoming'],
      ['2026-12-05', 'upcoming'],
    ]);

    const configuredView = selectEventDrawView({
      ...fiveDayEv,
      config: { days: ['2026-12-05', '2026-12-01', '2026-12-05', '2026-12-03'] },
    }, {
      ...SNAP.draw!,
      days: [{ day: '2026-12-01', kind: 'grand-catch', index: 5, score: 97 }],
    }, midNow);
    expect(configuredView.days.map(d => [d.day, d.status])).toEqual([
      ['2026-12-01', 'attended'],
      ['2026-12-03', 'upcoming'],
      ['2026-12-05', 'upcoming'],
    ]);

    const invalidConfigView = selectEventDrawView({
      ...fiveDayEv,
      config: { days: ['2026-12-01', 'not-a-date'] },
    }, SNAP.draw, midNow);
    expect(invalidConfigView.days).toHaveLength(5);
  });
});
