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
    expect(data.boardPorts).toEqual(['부산항', '마닐라항', '콜롬보항', '투아마시나항', '월비스베이항', '리스본항']);
  });

  it('수주한 일반 의뢰는 이름, 대상 구역, 대상 해역 요약, 목표, 진행도, 완료/포기 여부, 보상, 마치는 곳을 가진다', () => {
    const quest = bountyById('pacific-easy-common')!;
    const data = info(snap({ progress: [{ questId: quest.id, progress: 3 }] }));
    expect(data.general).toMatchObject({
      title: '태평양 쉬움 의뢰',
      zoneName: '태평양',
      watersSummary: '태평양 연안, 마리아나 해구',
      grade: 'common',
      count: quest.count,
      progress: 3,
      done: false,
      canAbandon: true,
      reward: quest.reward,
      finishAt: '부산항 수배판',
    });
    expect(data.named).toBeNull();
  });

  it('동남아 일반 의뢰는 소속 하위 해역을 쉼표로 요약한다', () => {
    const quest = bountyById('seasia-easy-common')!;
    const data = info(snap({ progress: [{ questId: quest.id, progress: 0 }] }));
    expect(data.general).toMatchObject({
      zoneName: '동남아',
      watersSummary: '드래곤 홀, 코론 침선 지대, 그레이트 배리어 리프',
    });
  });

  it('목표를 다 채운 일반 의뢰는 done이고 포기할 수 없다', () => {
    const quest = bountyById('pacific-easy-common')!;
    const data = info(snap({ progress: [{ questId: quest.id, progress: quest.count }] }));
    expect(data.general?.done).toBe(true);
    expect(data.general?.canAbandon).toBe(false);
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
    expect(hidden).toMatchObject({
      zoneName: '태평양',
      haunt: '태평양 전체',
      reward: { base: quest.reward, mods: [], value: quest.reward },
      materialName: '돌이 된 이빨',
      finishAt: '부산항 수배판',
      done: false,
      canAbandon: true,
      hasTicket: false,
      count: quest.count,
      progress: 0,
    });

    const spotNamed = bountyById('southatlantic-named-jasconius')!;
    const spotInfo = info(snap({ progress: [{ questId: spotNamed.id, progress: 0 }] })).named!;
    expect(spotInfo.zoneName).toBe('남대서양');
    expect(spotInfo.haunt).toBe('남대서양 (세인트헬레나)');

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
    expect(withTicket.hasTicket).toBe(true);
    expect(info(snap({ progress: [{ questId: quest.id, progress: 0 }] })).named!.hasTicket).toBe(false);
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
    expect(data.canAbandon).toBe(false);
    expect(data.hasTicket).toBe(false);
    expect(data.traceMins).toBeNull();
  });
});
