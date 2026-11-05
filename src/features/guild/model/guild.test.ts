import { describe, expect, it } from 'vitest';
import type { GuildBonusItem, GuildInfo, GuildMemberItem } from '../../../platform/api';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import {
  GUILD_ERROR_TEXT, activeEffectLines, bonusEffectText, bonusRows, donorRanking, growthBar, inviteLeftText, leaveOutcome, levelSteps,
  logAgoText, logLine, memberActions, splitMembers,
} from './guild';

const member = (uid: string, role: GuildMemberItem['role'], leftAt: string | null = null): GuildMemberItem =>
  ({ uid, nick: uid, role, joinedAt: '2026-11-05T00:00:00.000Z', leftAt, online: false, contribution: { total: 0, today: 0 } });
const guild = (role: GuildInfo['role'], members: GuildMemberItem[]): GuildInfo =>
  ({ id: 'g', name: '심해', createdAt: '2026-11-05T00:00:00.000Z', role, members, invite: null,
    growth: { level: 1, total: 0, floor: 0, next: 10_000 }, bonuses: [], effects: NO_GUILD_EFFECTS, donors: [], logbook: [] });

describe('길드 화면 모델', () => {
  const members = [member('L', 'leader'), member('A', 'member'), member('B', 'member', '2026-11-05T01:00:00.000Z')];

  it('지금 길드원과 떠난 선원을 나눈다', () => {
    const { active, departed } = splitMembers(members);
    expect(active.map(m => m.uid)).toEqual(['L', 'A']);
    expect(departed.map(m => m.uid)).toEqual(['B']);
  });

  it('길드장에게만 다른 길드원 내보내기·위임이 열리고, 떠나기는 위임이 먼저인지 알려 준다', () => {
    expect(memberActions(guild('leader', members), 'L', members[1])).toEqual({ kick: true, handover: true });
    expect(memberActions(guild('leader', members), 'L', members[0])).toEqual({ kick: false, handover: false });
    expect(memberActions(guild('member', members), 'A', members[0])).toEqual({ kick: false, handover: false });
    expect(leaveOutcome(guild('member', members), 'A')).toBe('leave');
    expect(leaveOutcome(guild('leader', members), 'L')).toBe('handover-first');
    expect(leaveOutcome(guild('leader', [members[0]]), 'L')).toBe('dissolve');
  });

  it('초대 코드가 남은 시간을 시간·분으로 알린다', () => {
    const now = Date.parse('2026-11-05T00:00:00.000Z');
    expect(inviteLeftText('2026-11-06T00:00:00.000Z', now)).toBe('24시간 남음');
    expect(inviteLeftText('2026-11-05T00:30:00.000Z', now)).toBe('30분 남음');
    expect(inviteLeftText('2026-11-04T00:00:00.000Z', now)).toBe('만료됨');
  });

  it('서버 거부 코드마다 안내 문장이 있다', () => {
    for (const code of ['bad-name', 'name-taken', 'already-in-guild', 'bad-code', 'guild-full', 'not-leader', 'handover-first', 'account-only',
      'not-enough-gold', 'bonus-locked', 'rank-maxed', 'bad-amount', 'restricted']) {
      expect(GUILD_ERROR_TEXT[code]).toBeTruthy();
    }
  });
});

describe('길드 성장 화면 모델', () => {
  const growth = (level: number, total: number, floor: number, next: number | null) => ({ level, total, floor, next });

  it('진행 막대는 지금 레벨 안에서 채운 비율과 다음 레벨까지 남은 기여다. 최고 레벨은 가득 차고 남은 기여가 없다', () => {
    expect(growthBar(growth(2, 17_500, 10_000, 25_000))).toEqual({ ratio: 0.5, remaining: 7_500 });
    expect(growthBar(growth(5, 150_000, 100_000, null))).toEqual({ ratio: 1, remaining: null });
  });

  it('레벨 사다리는 레벨마다 문턱과 새로 열리는 보너스를 보이고, 지나온·현재·다음·잠긴 레벨을 나눈다', () => {
    const steps = levelSteps(growth(3, 45_000, 25_000, 50_000));
    expect(steps.map(s => [s.level, s.floor, s.state])).toEqual([
      [1, 0, 'done'], [2, 10_000, 'done'], [3, 25_000, 'current'], [4, 50_000, 'next'], [5, 100_000, 'locked'],
    ]);
    expect(steps.map(s => s.perks)).toEqual([
      ['판매가 열림'],
      ['가방 용량 열림', '보너스 단계 상한 2'],
      ['네임드 조우 보너스 열림', '보너스 단계 상한 3'],
      ['희귀 어종 보너스 열림', '보너스 단계 상한 4'],
      ['돌연변이 보너스 열림', '보너스 단계 상한 5'],
    ]);
  });

  it('항해일지 한 줄을 문장으로 옮긴다', () => {
    const log = (kind: GuildInfo['logbook'][number]['kind'], detail: string | null = null, nick: string | null = '가람',
      value: number | null = null) => ({ id: 1, kind, uid: 'u', nick, detail, value, at: '2026-11-05T00:00:00.000Z' });
    expect(logLine(log('join'))).toBe('가람 님이 길드에 들어왔어요.');
    expect(logLine(log('leave'))).toBe('가람 님이 길드를 떠났어요.');
    expect(logLine(log('kick', null, null))).toBe('이름 없음 님이 길드에서 내보내졌어요.');
    expect(logLine(log('legendary', 'goldcarp'))).toBe('가람 님이 전설 황금잉어 낚시에 성공했어요!');
    expect(logLine(log('named', 'pacific-named-megalodon'))).toBe('가람 님이 네임드 메갈로돈 토벌에 성공했어요!');
    expect(logLine(log('donate', 'sell', '가람', 100_000))).toBe('가람 님이 판매가에 100,000골드를 기부했어요.');
    expect(logLine(log('bonus-up', 'mutation', '가람', 2))).toBe('가람 님의 기부로 돌연변이 보너스 2단계가 됐어요!');
  });
});

describe('길드 보너스 화면 모델', () => {
  const item = (over: Partial<GuildBonusItem>): GuildBonusItem => ({ id: 'sell', unlock: 1, rank: 0, cap: 0, pool: 0,
    next: null, effect: 0, nextEffect: 0.02, mine: 0, ...over });

  it('효과 문장 — 비율은 %, 돌연변이는 %p, 희귀 어종은 일반 어종 가중치를 줄인다', () => {
    expect(bonusEffectText('sell', 0.06)).toBe('판매가 +6%');
    expect(bonusEffectText('bag', 0.2)).toBe('가방 용량 +20%');
    expect(bonusEffectText('named', 0.05)).toBe('네임드 조우 +5%');
    expect(bonusEffectText('rare', 0.04)).toBe('일반 어종 가중치 −4%');
    expect(bonusEffectText('mutation', 0.03)).toBe('돌연변이 확률 +3%p');
  });

  it('보너스 열 — 잠김, 지금→다음 효과, 다음 단계까지 모인 비율과 남은 골드, 기부 가능 여부', () => {
    const [sell, bag, named] = bonusRows([
      item({ id: 'sell', rank: 2, cap: 4, pool: 125_000, next: 500_000, effect: 0.04, nextEffect: 0.06, mine: 9 }),
      item({ id: 'bag', unlock: 2, rank: 3, cap: 3, next: 1_500_000, effect: 0.12, nextEffect: 0.16 }),
      item({ id: 'named', unlock: 4, cap: 0, nextEffect: 0.05 }),
    ]);
    expect(sell).toMatchObject({ name: '판매가', locked: false, now: '판매가 +4%', after: '판매가 +6%', ratio: 0.25,
      need: 375_000, canDonate: true, mine: 9 });
    expect(bag).toMatchObject({ now: '가방 용량 +12%', canDonate: false, need: null, ratio: 0 });
    expect(named).toMatchObject({ name: '네임드 조우 보너스', locked: true, now: null, canDonate: false });
  });

  it('스킬 트리 노드 — 이룬 단계, 모으는 다음 단계(채운 비율), 상한 안의 먼 단계, 상한 위 단계', () => {
    const [sell, named] = bonusRows([
      item({ id: 'sell', rank: 2, cap: 4, pool: 125_000, next: 500_000 }),
      item({ id: 'named', unlock: 4, cap: 0 }),
    ]);
    expect(sell.nodes).toEqual([
      { rank: 1, state: 'done', fill: 1 }, { rank: 2, state: 'done', fill: 1 }, { rank: 3, state: 'next', fill: 0.25 },
      { rank: 4, state: 'open', fill: 0 }, { rank: 5, state: 'capped', fill: 0 },
    ]);
    expect(named.nodes.every(n => n.state === 'capped')).toBe(true);
  });

  it('기부 순위는 전체 기부액 순이고 같은 금액은 같은 순위다. 내 줄을 표시한다', () => {
    expect(donorRanking([{ uid: 'a', nick: 'A', gold: 300 }, { uid: 'me', nick: 'M', gold: 300 }, { uid: null, nick: null, gold: 10 }], 'me'))
      .toEqual([
        { rank: 1, nickname: 'A', value: 300, me: false },
        { rank: 1, nickname: 'M', value: 300, me: true },
        { rank: 3, nickname: null, value: 10, me: false },
      ]);
  });

  it('받는 보너스 문장 — 1단계 이상인 보너스만', () => {
    expect(activeEffectLines([item({ rank: 1, effect: 0.02 }), item({ id: 'bag', rank: 0 })])).toEqual(['판매가 +2%']);
  });
});

describe('항해일지 시각', () => {
  it('지난 시간을 분·시간·일로 보인다', () => {
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(logAgoText('2026-11-05T11:59:40Z', now)).toBe('방금 전');
    expect(logAgoText('2026-11-05T11:15:00Z', now)).toBe('45분 전');
    expect(logAgoText('2026-11-05T09:00:00Z', now)).toBe('3시간 전');
    expect(logAgoText('2026-11-02T12:00:00Z', now)).toBe('3일 전');
  });
});
