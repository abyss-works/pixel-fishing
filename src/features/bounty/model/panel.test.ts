import { describe, expect, it } from 'vitest';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../game/rules/balance';
import { BOUNTIES, bountyById, dailyQuestFor } from '../../../game/content/bounties';
import { newState } from '../../../game/rules/logic';
import { clearsLeft, questLabel, selectBountyPanelData, selectNamedBountyCardData } from './panel';

const clears = (general: number, named = 0) => ({ general, named });

describe('의뢰 화면 데이터', () => {
  it('오늘의 의뢰·남은 클리어 수·진행도·도전권 잔여를 한 번에 계산한다', () => {
    const game = newState();
    const day = '2026-10-13';
    const uid = 'player-1';
    const quest = dailyQuestFor('pacific', 'easy', uid, day)!;
    const namedQuest = dailyQuestFor('pacific', 'named', uid, day)!;
    const snapshot = {
      clearsToday: clears(1, 1),
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
    expect(data.leftNamed).toBe(0);
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
      snapshot: { clearsToday: clears(0), progress: [{ questId: quest.id, progress: 0 }], tickets: [] },
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

describe('오늘 남은 클리어 횟수', () => {
  it('일반 의뢰와 네임드 토벌을 따로 센다', () => {
    const snapshot = { clearsToday: clears(1, 0), progress: [], tickets: [] };
    expect(clearsLeft(snapshot)).toEqual({
      general: BOUNTY_DAILY_CAP - 1, named: BOUNTY_NAMED_DAILY_CAP,
    });
  });

  it('수주만으로는 줄지 않는다 — 진행 중인 의뢰가 있어도 클리어가 0이면 한도가 그대로다', () => {
    const snapshot = { clearsToday: clears(0), progress: [{ questId: 'pacific-easy-common', progress: 3 }], tickets: [] };
    expect(clearsLeft(snapshot)).toEqual({ general: BOUNTY_DAILY_CAP, named: BOUNTY_NAMED_DAILY_CAP });
  });

  it('한도를 넘겨 기록돼도 음수로 보이지 않는다', () => {
    expect(clearsLeft({ clearsToday: clears(5, 5), progress: [], tickets: [] })).toEqual({ general: 0, named: 0 });
  });

  it('스냅샷이 없으면(불러오는 중·오프라인) null — 0으로 보이지 않게', () => {
    expect(clearsLeft(null)).toBeNull();
  });
});

describe('의뢰판의 수주 가능 여부와 안내', () => {
  const game = newState();
  const day = '2026-10-13';
  const uid = 'player-1';
  const nowMs = Date.parse('2026-10-13T00:01:00.000Z');
  const data = (snapshot: Parameters<typeof selectBountyPanelData>[0]['snapshot'], port: 'harbor' | 'manila' = 'harbor') =>
    selectBountyPanelData({ game, port, uid, day, nowMs, snapshot });
  const snap = (over: Partial<NonNullable<Parameters<typeof data>[0]>> = {}) =>
    ({ clearsToday: clears(0), progress: [], tickets: [], ...over });

  it('클리어 0이고 진행 중인 의뢰가 없으면 두 갈래 모두 수주할 수 있고 안내가 없다', () => {
    const d = data(snap());
    expect(d.canTake).toBe(true);
    expect(d.canTakeNamed).toBe(true);
    expect(d.notice).toEqual({ general: null, named: null });
  });

  it('스냅샷이 없으면 수주할 수 없고 안내도 없다', () => {
    const d = data(null);
    expect(d.canTake).toBe(false);
    expect(d.canTakeNamed).toBe(false);
    expect(d.notice).toEqual({ general: null, named: null });
  });

  it('일반 의뢰를 오늘 클리어했으면 일반만 막히고 새벽 4시를 안내한다', () => {
    const d = data(snap({ clearsToday: clears(1, 0) }));
    expect(d.canTake).toBe(false);
    expect(d.canTakeNamed).toBe(true);
    expect(d.notice.general).toBe('오늘 일반 의뢰는 이미 마쳤어요. 새벽 4시가 지나면 다시 수주할 수 있어요.');
    expect(d.notice.named).toBeNull();
  });

  it('네임드 토벌을 오늘 클리어했으면 네임드만 막힌다', () => {
    const d = data(snap({ clearsToday: clears(0, 1) }));
    expect(d.canTake).toBe(true);
    expect(d.canTakeNamed).toBe(false);
    expect(d.notice.named).toBe('오늘 네임드 토벌은 이미 마쳤어요. 새벽 4시가 지나면 다시 수주할 수 있어요.');
  });

  it('일반 의뢰가 진행 중이면 이 구역의 다른 난이도도 막힌다 — 진행 중인 칸은 그 의뢰가 차지하고 안내는 없다', () => {
    const held = dailyQuestFor('pacific', 'easy', uid, day)!;
    const d = data(snap({ progress: [{ questId: held.id, progress: 2 }] }));
    expect(d.canTake).toBe(false);
    expect(d.canTakeNamed).toBe(true);
    expect(d.offers.easy?.id).toBe(held.id);
    expect(d.isAccepted(held.id)).toBe(true);
    expect(d.notice.general).toBeNull(); // 진행 중인 의뢰가 이 판에 보인다
  });

  it('진행 중인 일반 의뢰가 오늘의 의뢰와 달라도(날이 바뀐 뒤) 그 칸에 그대로 보인다 — 마친 의뢰를 받을 수 있어야 한다', () => {
    const today = dailyQuestFor('pacific', 'normal', uid, day)!;
    const old = BOUNTIES.find(q => q.zone === 'pacific' && q.difficulty === 'normal' && q.id !== today.id)!;
    const d = data(snap({ progress: [{ questId: old.id, progress: old.count }] }));
    expect(d.offers.normal?.id).toBe(old.id);
    expect(d.progressOf(old.id)).toBe(old.count);
  });

  it('다른 구역에서 수주한 일반 의뢰가 진행 중이면 막히고 이유를 안내한다', () => {
    const held = dailyQuestFor('seasia', 'hard', uid, day)!;
    const d = data(snap({ progress: [{ questId: held.id, progress: 0 }] }), 'harbor');
    expect(d.canTake).toBe(false);
    expect(d.notice.general).toBe('다른 구역에서 수주한 일반 의뢰가 있어요. 먼저 마쳐 주세요.');
    expect(d.offers.hard?.zone).toBe('pacific');
  });

  it('다른 구역에서 수주한 네임드 토벌이 진행 중이면 막히고 이유를 안내한다', () => {
    const held = dailyQuestFor('seasia', 'named', uid, day)!;
    const d = data(snap({ progress: [{ questId: held.id, progress: 0 }] }), 'harbor');
    expect(d.canTakeNamed).toBe(false);
    expect(d.notice.named).toBe('다른 구역에서 수주한 네임드 토벌이 있어요. 먼저 마쳐 주세요.');
  });

  it('한도와 진행 중이 함께 걸리면 한도 안내가 먼저다', () => {
    const held = dailyQuestFor('seasia', 'hard', uid, day)!;
    const d = data(snap({ clearsToday: clears(1, 0), progress: [{ questId: held.id, progress: 0 }] }));
    expect(d.notice.general).toContain('이미 마쳤어요');
  });
});
