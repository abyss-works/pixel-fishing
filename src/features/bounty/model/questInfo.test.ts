import { describe, expect, it } from 'vitest';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../game/rules/balance';
import { bountyById } from '../../../game/content/bounties';
import { newState } from '../../../game/rules/logic';
import { ticketRemainingMs } from '../../../game/rules/challenge';
import { selectQuestInfo } from './questInfo';
import type { BountySnapshot } from './types';

const NOW = Date.parse('2026-10-13T00:01:00.000Z');
const snap = (over: Partial<BountySnapshot> = {}): BountySnapshot => ({
  clearsToday: { general: 0, named: 0 }, progress: [], tickets: [], ...over,
});
const info = (snapshot: BountySnapshot | null, game = newState()) => selectQuestInfo({ game, snapshot, nowMs: NOW });

describe('현재 의뢰 정보', () => {
  it('스냅샷이 없으면(불러오는 중, 오프라인) 의뢰 카드도 남은 횟수도 없다', () => {
    const data = info(null);
    expect(data.left).toBeNull();
    expect(data.general).toBeNull();
    expect(data.named).toBeNull();
  });

  it('받은 의뢰가 없어도 값은 만들어지고, 수배판이 있는 항구 이름을 안내한다', () => {
    const data = info(snap());
    expect(data.general).toBeNull();
    expect(data.named).toBeNull();
    expect(data.left).toEqual({ general: BOUNTY_DAILY_CAP, named: BOUNTY_NAMED_DAILY_CAP });
    expect(data.caps).toEqual({ general: BOUNTY_DAILY_CAP, named: BOUNTY_NAMED_DAILY_CAP });
    expect(data.boardPorts).toEqual(['부산항', '마닐라항', '콜롬보항', '투아마시나항', '월비스베이항']);
  });

  it('수주한 일반 의뢰는 이름, 목표, 진행도, 보상, 마치는 곳을 가진다', () => {
    const quest = bountyById('pacific-easy-common')!;
    const data = info(snap({ progress: [{ questId: quest.id, progress: 3 }] }));
    expect(data.general).toMatchObject({
      title: '태평양 쉬움 의뢰', grade: 'common', count: quest.count, progress: 3, reward: quest.reward,
      finishAt: '부산항 수배판',
    });
    expect(data.named).toBeNull();
  });

  it('진행도는 목표 마릿수를 넘겨 보이지 않고, 진행도 0인 수주도 의뢰로 본다', () => {
    const quest = bountyById('pacific-easy-epic')!;
    expect(info(snap({ progress: [{ questId: quest.id, progress: 0 }] })).general?.progress).toBe(0);
    expect(info(snap({ progress: [{ questId: quest.id, progress: 99 }] })).general?.progress).toBe(quest.count);
  });

  it('의뢰를 마칠 항구는 의뢰 구역에서 정한다', () => {
    const quest = bountyById('seasia-easy-common')!;
    expect(info(snap({ progress: [{ questId: quest.id, progress: 0 }] })).general?.finishAt).toBe('마닐라항 수배판');
  });

  it('네임드 토벌은 아직 발견하지 못했으면 이름이 ???이고, 발견하면 이름을 보인다', () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const snapshot = snap({ progress: [{ questId: quest.id, progress: 0 }] });
    const hidden = info(snapshot).named!;
    expect(hidden.title).toBe('???');
    expect(hidden).toMatchObject({ haunt: expect.any(String), reward: quest.reward, materialName: '돌이 된 이빨',
      finishAt: '부산항 수배판', done: false, count: quest.count, progress: 0 });

    const game = newState();
    game.dex[quest.targetFish!] = { normal: { count: 1, maxSize: 10, first: null } };
    expect(info(snapshot, game).named!.title).toBe('메갈로돈');
  });

  it('네임드의 흔적 남은 시간은 유효한 도전권이 있을 때만 있고, 규칙 함수가 정한 분(올림)이다', () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const issuedAt = '2026-10-13T00:00:00.000Z';
    const withTicket = info(snap({
      progress: [{ questId: quest.id, progress: 0 }], tickets: [{ questId: quest.id, issuedAt }],
    })).named!;
    expect(withTicket.traceMins).toBe(Math.ceil(ticketRemainingMs(issuedAt, NOW) / 60_000));
    expect(withTicket.traceMins).toBeGreaterThan(0);
    expect(info(snap({ progress: [{ questId: quest.id, progress: 0 }] })).named!.traceMins).toBeNull();
  });

  it('만료된 도전권은 흔적 시간을 만들지 않고, 시계를 아직 안 찍었으면(0) 만들지 않는다', () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const snapshot = snap({
      progress: [{ questId: quest.id, progress: 0 }],
      tickets: [{ questId: quest.id, issuedAt: '2026-10-01T00:00:00.000Z' }],
    });
    expect(info(snapshot).named!.traceMins).toBeNull();
    expect(selectQuestInfo({ game: newState(), snapshot, nowMs: 0 }).named!.traceMins).toBeNull();
  });

  it('토벌을 마친 네임드는 done이고 흔적 시간을 보이지 않는다', () => {
    const quest = bountyById('pacific-named-megalodon')!;
    const data = info(snap({
      progress: [{ questId: quest.id, progress: quest.count }],
      tickets: [{ questId: quest.id, issuedAt: '2026-10-13T00:00:00.000Z' }],
    })).named!;
    expect(data.done).toBe(true);
    expect(data.traceMins).toBeNull();
  });
});
