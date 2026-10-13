import { describe, expect, it } from 'vitest';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../game/rules/balance';
import { BOUNTIES, dailyQuestFor } from '../../../game/content/bounties';
import { newState } from '../../../game/rules/logic';
import { selectBountyPanelData, selectNamedBountyCardData } from './panel';

describe('의뢰 화면 데이터', () => {
  it('오늘의 의뢰·수주 가능 수·진행도·도전권 잔여를 한 번에 계산한다', () => {
    const game = newState();
    const day = '2026-10-13';
    const uid = 'player-1';
    const quest = dailyQuestFor('pacific', 'easy', uid, day)!;
    const namedQuest = dailyQuestFor('pacific', 'named', uid, day)!;
    const snapshot = {
      licensed: [], acceptsToday: 2, namedToday: 1,
      progress: [{ questId: quest.id, progress: 3 }],
      tickets: [{ questId: namedQuest.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    };

    const data = selectBountyPanelData({
      game, port: 'harbor', uid, day,
      nowMs: Date.parse('2026-10-13T00:01:00.000Z'), snapshot,
    });

    expect(data.offers.easy?.id).toBe(quest.id);
    expect(data.leftAll).toBe(BOUNTY_DAILY_CAP - 2);
    expect(data.leftNamed).toBe(BOUNTY_NAMED_DAILY_CAP - 1);
    expect(data.progressOf(quest.id)).toBe(3);
    expect(data.ticketMins).toBeGreaterThan(0);
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
