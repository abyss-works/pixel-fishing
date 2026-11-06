import { describe, expect, it } from 'vitest';
import type { GuildBonusItem, GuildInfo, GuildInvitePreview, GuildMemberItem } from '../../../platform/api';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import {
  GUILD_BONUS_NAME, GUILD_JOIN_MODE_TEXT, GUILD_LEVEL_HELP, dailyContributionRows, GUILD_ERROR_TEXT, bonusEffectText, bonusEffectValue,
  bonusRows, growthBar, growthTotalText, guildAlertText, guildLinkUrl, inviteDialogView, inviteShareText, leaveConfirm, leaveOutcome,
  logbookDays, memberActions, memberConfirm, memberName, memberRows, requestRows, splitMembers,
} from './guild';

const member = (uid: string, role: GuildMemberItem['role'], leftAt: string | null = null): GuildMemberItem =>
  ({ uid, nick: uid, role, joinedAt: '2026-11-05T00:00:00.000Z', leftAt, online: false, contribution: { total: 0, today: 0 } });
const guild = (role: GuildInfo['role'], members: GuildMemberItem[]): GuildInfo =>
  ({ id: 'g', name: '심해', createdAt: '2026-11-05T00:00:00.000Z', role, members, code: 'K7QX2MAB', joinMode: 'approval', pitch: null,
    requests: [],
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

  it('가입 방식은 이름과 한 줄 설명을 갖는다', () => {
    expect(GUILD_JOIN_MODE_TEXT.open).toEqual({ name: '자유 가입', desc: '링크나 코드로 바로 들어와요.' });
    expect(GUILD_JOIN_MODE_TEXT.approval).toEqual({ name: '승인 가입', desc: '신청을 받고 길드장이 승인해요.' });
    expect(GUILD_JOIN_MODE_TEXT.closed).toEqual({ name: '닫힘', desc: '새 길드원을 받지 않아요.' });
  });

  it('초대 링크는 서비스 주소에 /g/코드를 붙이고, 복사 문구는 권유 문구(비었으면 기본 문구) 다음 줄에 링크를 둔다', () => {
    const url = guildLinkUrl('https://pf.dev', 'K7QX2MAB');
    expect(url).toBe('https://pf.dev/g/K7QX2MAB');
    expect(inviteShareText(null, url)).toBe('나랑 같이 낚시하자!\nhttps://pf.dev/g/K7QX2MAB');
    expect(inviteShareText('같이 가요', url)).toBe('같이 가요\nhttps://pf.dev/g/K7QX2MAB');
  });

  it('가입 신청 줄은 이름, 신청 시각, 남은 날 수를 싣는다', () => {
    expect(requestRows([{ uid: 'a', nick: null, requestedAt: '2026-11-05T00:00:00.000Z' }], '2026-11-06T12:00:00.000Z'))
      .toEqual([{ uid: 'a', name: '이름 없음', when: '11월 5일 09:00', daysLeft: 6 }]);
  });

  it('길드 알림 문장', () => {
    expect(guildAlertText({ t: 'guild', kind: 'request', guild: '심해', nick: '가람' })).toBe('가람 님이 심해 길드에 가입을 신청했어요.');
    expect(guildAlertText({ t: 'guild', kind: 'approved', guild: '심해', nick: null })).toBe('심해 길드 가입이 승인됐어요.');
    expect(guildAlertText({ t: 'guild', kind: 'rejected', guild: '심해', nick: null })).toBe('심해 길드 가입 신청이 거절됐어요.');
  });

  it('이름이 없는 길드원은 이름 없음으로 부른다', () => {
    expect(memberName({ nick: '가람' })).toBe('가람');
    expect(memberName({ nick: null })).toBe('이름 없음');
  });

  it('넘기기·내보내기 확인 창은 대상 이름과 보낼 요청을 담는다', () => {
    const g = { ...guild('leader', members), name: '심해' };
    expect(memberConfirm(g, members[1], 'handover')).toEqual({
      title: '길드장 넘기기', label: '넘기기', op: { op: 'handover', guildId: 'g', uid: 'A' },
      text: 'A 님에게 길드장을 넘길까요?\n나는 길드원이 되고, 되돌리려면 새 길드장이 다시 넘겨야 해요.',
      done: 'A 님에게 길드장을 넘겼어요.',
    });
    expect(memberConfirm(g, members[1], 'kick')).toEqual({
      title: '길드원 내보내기', label: '내보내기', op: { op: 'remove', guildId: 'g', uid: 'A' },
      text: 'A 님을 길드에서 내보낼까요?\n쌓은 기여와 기록은 길드에 남아요.',
      done: 'A 님을 내보냈어요.',
    });
  });

  it('떠나기 확인 창 — 길드원은 떠나기, 혼자 남은 길드장은 해산, 다른 길드원이 있는 길드장은 창이 없다', () => {
    expect(leaveConfirm(guild('member', members), 'A')).toEqual({
      title: '길드 떠나기', label: '떠나기', op: { op: 'remove', guildId: 'g', uid: 'A' },
      text: '심해 길드를 떠날까요?\n쌓은 기여와 기록은 길드에 남고, 다시 들어오려면 길드 코드가 필요해요.',
      done: '심해 길드를 떠났어요.',
    });
    expect(leaveConfirm(guild('leader', [members[0]]), 'L')).toEqual({
      title: '길드 해산', label: '해산', op: { op: 'remove', guildId: 'g', uid: 'L' },
      text: '혼자 남은 길드라 떠나면 심해 길드가 없어지고 길드 채팅도 지워져요.\n떠날까요?',
      done: '심해 길드를 해산했어요.',
    });
    expect(leaveConfirm(guild('leader', members), 'L')).toBeNull();
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

  it('누적 기여와 다음 레벨 문턱을 숫자로 보인다. 최고 레벨은 누적만 보인다', () => {
    expect(growthTotalText(growth(3, 31_000, 25_000, 50_000))).toBe('31,000 / 50,000');
    expect(growthTotalText(growth(5, 150_000, 100_000, null))).toBe('150,000');
  });

  it('기여 안내는 명성 하루 상한을 담는다', () => {
    // 하루 상한은 오늘 기여 도움말이 맡으므로 레벨 도움말에는 넣지 않는다
    expect(GUILD_LEVEL_HELP).toContain('길드 스킬');
    expect(GUILD_LEVEL_HELP.split('\n')).toHaveLength(2);
    expect(GUILD_LEVEL_HELP).not.toMatch(/1,000|500/);
  });

});

describe('오늘 기여 도움말', () => {
  it('하루 기여 상한을 갈래별 이름과 값의 목록으로 보인다', () => {
    expect(dailyContributionRows()).toEqual([
      { label: '명성', value: '2,000' },
      { label: '일반 의뢰', value: '500' },
      { label: '네임드 토벌', value: '1,000' },
    ]);
  });
});

describe('길드원 표', () => {
  it('지금 길드원만, 서버 순서대로, 사람별 전체 기부를 붙인다. 기부가 없으면 0이다', () => {
    const g = { ...guild('leader', [member('L', 'leader'), member('A', 'member'), member('B', 'member', '2026-11-05T01:00:00.000Z')]),
      donors: [{ uid: 'A', nick: 'A', gold: 900 }, { uid: null, nick: null, gold: 5 }] };
    g.members[0] = { ...g.members[0], online: true, contribution: { total: 30, today: 7 } };
    expect(memberRows(g, 'L')).toEqual([
      { uid: 'L', name: 'L', leader: true, me: true, online: true, today: 7, total: 30, gave: 0 },
      { uid: 'A', name: 'A', leader: false, me: false, online: false, today: 0, total: 0, gave: 900 },
    ]);
  });
});

describe('항해일지', () => {
  const log = (id: number, kind: GuildInfo['logbook'][number]['kind'], at: string, detail: string | null = null,
    value: number | null = null, uid = 'u', nick: string | null = '가람') => ({ id, kind, uid, nick, detail, value, at });

  it('한국 날짜마다 묶고, 각 줄은 한국 시각과 강조 조각으로 나눈 문장이다', () => {
    const days = logbookDays([
      log(3, 'legendary', '2026-11-05T05:20:00.000Z', 'goldcarp', null, 'me', '나'),
      log(2, 'join', '2026-11-04T16:00:00.000Z'),
      log(1, 'leave', '2026-11-04T01:12:00.000Z', null, null, 'u', null),
    ], 'me');
    expect(days.map(d => [d.day, d.items.map(i => [i.id, i.time])])).toEqual([
      ['11월 5일', [[3, '14:20'], [2, '01:00']]],
      ['11월 4일', [[1, '10:12']]],
    ]);
    expect(days[0].items[0].parts).toEqual([
      { text: '나', tone: 'me' }, { text: ' 님이 ' }, { text: '전설 황금잉어', tone: 'legend' }, { text: '를 낚았어요!' },
    ]);
    expect(days[1].items[0]).toMatchObject({ kind: 'leave', quiet: true,
      parts: [{ text: '이름 없음', tone: 'nick' }, { text: ' 님이 길드를 떠났어요.' }] });
  });

  it('네임드 토벌, 기부, 단계 상승. 단계 상승은 누구의 기부로 올랐는지 적지 않는다', () => {
    const at = '2026-11-05T00:00:00.000Z';
    const [day] = logbookDays([
      log(3, 'named', at, 'pacific-named-megalodon'),
      log(2, 'donate', at, 'sell', 150_000),
      log(1, 'bonus-up', at, 'rare', 2),
    ], 'me');
    expect(day.items.map(i => i.parts)).toEqual([
      [{ text: '가람', tone: 'nick' }, { text: ' 님이 ' }, { text: '네임드 메갈로돈', tone: 'named' }, { text: '을 토벌했어요!' }],
      [{ text: '가람', tone: 'nick' }, { text: ' 님이 ' }, { text: '판매가 보너스', tone: 'skill' }, { text: '에 ' },
        { text: '150,000G', tone: 'num' }, { text: '를 기부했어요.' }],
      [{ text: '길드 스킬 ' }, { text: '희귀 어종 확률', tone: 'skill' }, { text: '이 ' }, { text: '2', tone: 'num' }, { text: '단계가 됐어요!' }],
    ]);
  });
});

describe('길드 보너스 화면 모델', () => {
  const item = (over: Partial<GuildBonusItem>): GuildBonusItem => ({ id: 'sell', unlock: 1, rank: 0, cap: 0, pool: 0,
    next: null, effect: 0, nextEffect: 0.02, mine: 0, ...over });

  it('길드 스킬 이름', () => {
    expect(Object.values(GUILD_BONUS_NAME)).toEqual(['판매가 보너스', '가방 용량 증가', '네임드 조우 확률', '희귀 어종 확률', '돌연변이 확률']);
  });

  it('효과 값 — 비율은 %, 돌연변이는 %p, 희귀 어종은 줄이는 쪽이라 −', () => {
    expect(bonusEffectValue('sell', 0.06)).toBe('+6%');
    expect(bonusEffectValue('rare', 0.04)).toBe('−4%');
    expect(bonusEffectValue('mutation', 0.03)).toBe('+3%p');
  });

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
    expect(sell).toMatchObject({ name: '판매가 보너스', locked: false, now: '+4%', after: '+6%', ratio: 0.25,
      need: 375_000, canDonate: true });
    expect(bag).toMatchObject({ now: '+12%', canDonate: false, need: null, ratio: 0 });
    expect(named).toMatchObject({ name: '네임드 조우 확률', locked: true, now: null, canDonate: false });
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

});

describe('초대 확인 창', () => {
  const preview = (over: Partial<GuildInvitePreview> = {}): GuildInvitePreview =>
    ({ code: 'K7QX2MAB', name: '새벽선단', level: 3, members: 6, cap: 10, joinMode: 'open', ...over });
  const viewer = { account: true, guild: null as string | null };

  it('없는 코드는 찾지 못했다고 알리고 확인만 둔다', () => {
    expect(inviteDialogView(null, viewer)).toEqual({ state: 'bad', text: '초대 코드를 찾지 못했어요.\n링크가 맞는지 확인해 주세요.', action: null });
  });

  it('게스트는 계정이 있어야 한다고 알린다', () => {
    expect(inviteDialogView(preview(), { account: false, guild: null })).toMatchObject({ state: 'guest', action: null,
      text: '길드는 계정이 있어야 들어갈 수 있어요.\n계정을 만들거나 로그인하면 이 창이 다시 떠요.' });
  });

  it('다른 길드에 있으면 떠난 뒤에 들어갈 수 있다고 알리고, 같은 길드면 이미 있다고 알린다', () => {
    expect(inviteDialogView(preview(), { account: true, guild: '심해조합' })).toMatchObject({ state: 'member', action: null,
      text: '이미 다른 길드(심해조합)에 있어요.\n지금 길드를 떠난 뒤에 들어갈 수 있어요.' });
    expect(inviteDialogView(preview(), { account: true, guild: '새벽선단' })).toMatchObject({ state: 'member', action: null,
      text: '이미 새벽선단 길드에 있어요.' });
  });

  it('가입 방식과 인원에 따라 들어가기, 가입 신청, 받지 않음이다', () => {
    expect(inviteDialogView(preview(), viewer)).toEqual({ state: 'open', action: { label: '들어가기' },
      text: '들어가면 길드 채팅과 길드 스킬을 바로 함께 써요.' });
    expect(inviteDialogView(preview({ joinMode: 'approval' }), viewer)).toEqual({ state: 'approval', action: { label: '가입 신청' },
      text: '길드장이 승인하면 들어가요.\n신청은 7일 동안 남아요.' });
    expect(inviteDialogView(preview({ joinMode: 'closed' }), viewer)).toEqual({ state: 'closed', action: null,
      text: '이 길드는 지금 새 길드원을 받지 않아요.' });
    expect(inviteDialogView(preview({ members: 10 }), viewer)).toEqual({ state: 'full', action: null, text: '길드 인원이 가득 찼어요.' });
  });
});
