import { describe, expect, it } from 'vitest';
import type { BountySnapshot } from '../../bounty/model/types';
import { selectRewardsDue } from './rewardsDue';

const snap = (progress: BountySnapshot['progress']): BountySnapshot => ({
  clearsToday: { general: 0, named: 0 }, progress, tickets: [],
});
const none = { snapshot: null, claimable: 0, mailPending: 0, accountState: 'account' as const };

describe('받을 보상 모음', () => {
  it('받을 것이 없으면 줄도 총수도 없다', () => {
    const due = selectRewardsDue(none);
    expect(due.lines).toEqual([]);
    expect(due.total).toBe(0);
  });

  it('목표를 채운 일반 의뢰는 의뢰 창 줄이 되고 항구 수배판을 안내한다', () => {
    const due = selectRewardsDue({ ...none, snapshot: snap([{ questId: 'pacific-easy-epic', progress: 2 }]) });
    expect(due.lines).toHaveLength(1);
    expect(due.lines[0]).toMatchObject({ window: 'quests', text: '태평양 쉬움 의뢰', count: 1 });
    expect(due.lines[0].tip).toEqual(['태평양 쉬움 의뢰 목표를 달성했어요.', '부산항 수배판에서 보상을 받아 주세요.']);
  });

  it('목표를 못 채운 일반 의뢰는 줄이 없다', () => {
    const due = selectRewardsDue({ ...none, snapshot: snap([{ questId: 'pacific-easy-epic', progress: 1 }]) });
    expect(due.lines).toEqual([]);
  });

  it('토벌을 마친 네임드는 토벌 줄이 된다', () => {
    const due = selectRewardsDue({ ...none, snapshot: snap([{ questId: 'pacific-named-megalodon', progress: 1 }]) });
    expect(due.lines[0]).toMatchObject({ window: 'quests', text: '태평양 네임드 토벌' });
    expect(due.lines[0].tip).toEqual(['태평양 네임드를 토벌했어요.', '부산항 수배판에서 보상 받기를 눌러 주세요.']);
  });

  it('알 수 없는 의뢰 id는 건너뛴다', () => {
    expect(selectRewardsDue({ ...none, snapshot: snap([{ questId: 'nope', progress: 9 }]) }).lines).toEqual([]);
  });

  it('업적과 우편은 수를 줄 문구에 싣는다', () => {
    const due = selectRewardsDue({ ...none, claimable: 3, mailPending: 2 });
    expect(due.lines.map(l => [l.window, l.text, l.count])).toEqual([
      ['achievements', '업적 3개', 3], ['mailbox', '우편 2통', 2],
    ]);
    expect(due.lines[0].tip).toEqual(['받을 수 있는 업적이 3개 있어요.', '업적 창에서 받기를 눌러 주세요.']);
    expect(due.lines[1].tip).toEqual(['읽지 않은 우편이 있어요.', '우편함에서 확인해 주세요.']);
    expect(due.total).toBe(5);
  });

  it('줄 순서는 의뢰, 업적, 우편이고 총수는 줄의 수를 더한 값이다', () => {
    const due = selectRewardsDue({
      ...none, claimable: 1, mailPending: 1,
      snapshot: snap([{ questId: 'pacific-easy-epic', progress: 2 }, { questId: 'pacific-named-megalodon', progress: 1 }]),
    });
    expect(due.lines.map(l => l.window)).toEqual(['quests', 'quests', 'achievements', 'mailbox']);
    expect(due.total).toBe(4);
  });

  it('게스트와 확인 실패 상태에서는 잠긴 창의 줄을 두지 않는다', () => {
    const input = { ...none, claimable: 1, mailPending: 1, snapshot: snap([{ questId: 'pacific-easy-epic', progress: 2 }]) };
    expect(selectRewardsDue({ ...input, accountState: 'guest' }).lines).toEqual([]);
    expect(selectRewardsDue({ ...input, accountState: 'unverified' }).total).toBe(0);
  });

  it('창 이름은 줄이 여는 창을 가리킨다', () => {
    const due = selectRewardsDue({ ...none, claimable: 1, mailPending: 1, snapshot: snap([{ questId: 'pacific-easy-epic', progress: 2 }]) });
    expect(due.lines.map(l => l.windowName)).toEqual(['의뢰 창', '업적 창', '우편함 창']);
  });
});
