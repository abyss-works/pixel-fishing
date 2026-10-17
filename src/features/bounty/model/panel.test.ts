import { describe, expect, it } from 'vitest';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../game/rules/balance';
import { BOUNTIES, bountyById, dailyQuestFor } from '../../../game/content/bounties';
import { newState } from '../../../game/rules/logic';
import { acceptsLeft, questLabel, selectBountyPanelData, selectNamedBountyCardData } from './panel';

describe('의뢰 화면 데이터', () => {
  it('오늘의 의뢰·수주 가능 수·진행도·도전권 잔여를 한 번에 계산한다', () => {
    const game = newState();
    const day = '2026-10-13';
    const uid = 'player-1';
    const quest = dailyQuestFor('pacific', 'easy', uid, day)!;
    const namedQuest = dailyQuestFor('pacific', 'named', uid, day)!;
    const snapshot = {
      acceptsToday: 1, namedToday: 1,
      progress: [{ questId: quest.id, progress: 3 }],
      tickets: [{ questId: namedQuest.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    };

    const data = selectBountyPanelData({
      game, port: 'harbor', uid, day,
      nowMs: Date.parse('2026-10-13T00:01:00.000Z'), snapshot,
    });

    expect(data.offers.easy?.id).toBe(quest.id);
    expect(BOUNTY_DAILY_CAP).toBe(1); // 일반 의뢰 하루 1회
    expect(data.leftAll).toBe(0);
    expect(data.leftNamed).toBe(BOUNTY_NAMED_DAILY_CAP - 1);
    expect(data.progressOf(quest.id)).toBe(3);
    expect(data.ticketMins).toBeGreaterThan(0);
  });

  it('수주한 의뢰는 진행도가 0이어도 진행 중이다 — 진행 행이 수주의 표시다', () => {
    const game = newState();
    const day = '2026-10-13';
    const uid = 'player-1';
    const quest = dailyQuestFor('pacific', 'easy', uid, day)!;
    const other = dailyQuestFor('pacific', 'normal', uid, day)!;
    const data = selectBountyPanelData({
      game, port: 'harbor', uid, day, nowMs: Date.parse('2026-10-13T00:01:00.000Z'),
      snapshot: { acceptsToday: 1, namedToday: 0, progress: [{ questId: quest.id, progress: 0 }], tickets: [] },
    });
    expect(data.isAccepted(quest.id)).toBe(true);
    expect(data.progressOf(quest.id)).toBe(0);
    expect(data.isAccepted(other.id)).toBe(false);
  });

  it('네임드 카드의 발견 공개와 완료 여부를 계산한다', () => {
    const game = newState();
    const quest = BOUNTIES.find(row => row.difficulty === 'named')!;
    const hidden = selectNamedBountyCardData(game, quest, quest.count);
    game.dex[quest.targetFish!] = { normal: { count: 1, maxSize: 10, first: null } };
    const found = selectNamedBountyCardData(game, quest, quest.count);

    expect(hidden).toMatchObject({ found: false, done: true });
    expect(found).toMatchObject({ found: true, done: true });
    expect(found.name).toBeTruthy();
  });
});

describe('의뢰 이름 — 토스트·안내에 쓰는 사람이 읽는 이름', () => {
  it('일반 의뢰는 구역 · 난이도, 네임드는 구역 · 네임드 토벌이다 — 내부 id를 보이지 않는다', () => {
    expect(questLabel(bountyById('pacific-easy-common')!)).toBe('태평양 쉬움 의뢰');
    expect(questLabel(bountyById('pacific-hard-legendary')!)).toBe('태평양 어려움 의뢰');
    const named = BOUNTIES.find(q => q.difficulty === 'named' && q.zone === 'madagascar')!;
    expect(questLabel(named)).toBe('마다가스카르 네임드 토벌');
  });
});

describe('오늘 남은 수주 횟수', () => {
  it('일반 수주와 네임드 토벌을 따로 센다', () => {
    const snapshot = { acceptsToday: 1, namedToday: 0, progress: [], tickets: [] };
    expect(acceptsLeft(snapshot)).toEqual({
      general: BOUNTY_DAILY_CAP - 1, named: BOUNTY_NAMED_DAILY_CAP,
    });
  });

  it('스냅샷이 없으면(불러오는 중·오프라인) null — 0으로 보이지 않게', () => {
    expect(acceptsLeft(null)).toBeNull();
  });
});
