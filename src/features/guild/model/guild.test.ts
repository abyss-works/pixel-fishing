import { describe, expect, it } from 'vitest';
import type { GuildBonusItem, GuildInfo, GuildInvitePreview, GuildMemberItem } from '../../../platform/api';
import { NO_GUILD_EFFECTS } from '../../../game/rules/guild';
import {
  GUILD_BONUS_NAME, GUILD_ENHANCE_LOCK_NOTE, GUILD_JOIN_MODE_TEXT, GUILD_LEAVE_COOLDOWN_NOTE, GUILD_LEVEL_HELP,
  PUBLIC_GUILD_SORT_OPTIONS, dailyContributionRows, GUILD_ERROR_TEXT, bonusEffectText, bonusEffectValue,
  bonusRows, donateDisabledReason, enhanceInvestState, enhancePoolSummary, enhanceResetCostRows, enhanceResetState,
  growthBar, growthTotalText, guildActivityText, guildAlertText, guildCooldownInfo, guildErrorText, guildLinkUrl, inviteDialogView, inviteShareText, leaveConfirm, leaveOutcome,
  logbookDays, memberActions, memberConfirm, memberName, memberRows, personalNodes, publicGuildRowState, publicJoinConfirm, renameButtonState, requestRows, splitMembers,
} from './guild';

const member = (uid: string, role: GuildMemberItem['role'], leftAt: string | null = null): GuildMemberItem =>
  ({ uid, nick: uid, role, joinedAt: '2026-11-05T00:00:00.000Z', leftAt, online: false, contribution: { total: 0, today: 0 } });
const guild = (role: GuildInfo['role'], members: GuildMemberItem[]): GuildInfo =>
  ({ id: 'g', name: '심해', createdAt: '2026-11-05T00:00:00.000Z', role, members, code: 'K7QX2MAB', joinMode: 'approval', pitch: null,
    requests: [], renamedAt: null, enhanceResetCount: 0,
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
      warn: '내보내기 처리 시 20시간 동안 모든 길드에 재가입할 수 없어요.',
      done: 'A 님을 내보냈어요.',
    });
  });

  it('떠나기 확인 창 — 길드원은 떠나기, 혼자 남은 길드장은 해산, 다른 길드원이 있는 길드장은 창이 없다', () => {
    expect(leaveConfirm(guild('member', members), 'A')).toEqual({
      title: '길드 떠나기', label: '떠나기', op: { op: 'remove', guildId: 'g', uid: 'A' },
      text: '심해 길드를 떠날까요?\n쌓은 기여와 기록은 길드에 남고, 다시 들어오려면 길드 코드가 필요해요.',
      warn: GUILD_LEAVE_COOLDOWN_NOTE,
      done: '심해 길드를 떠났어요.',
    });
    expect(leaveConfirm(guild('leader', [members[0]]), 'L')).toEqual({
      title: '길드 해산', label: '해산', op: { op: 'remove', guildId: 'g', uid: 'L' },
      text: '혼자 남은 길드라 떠나면 심해 길드가 없어지고 길드 채팅도 지워져요.\n떠날까요?',
      warn: GUILD_LEAVE_COOLDOWN_NOTE,
      done: '심해 길드를 해산했어요.',
    });
    expect(leaveConfirm(guild('leader', members), 'L')).toBeNull();
  });

  it('서버 거부 코드마다 안내 문장이 있다', () => {
    for (const code of ['bad-name', 'name-taken', 'already-in-guild', 'bad-code', 'guild-full', 'not-leader', 'handover-first', 'account-only',
      'not-enough-gold', 'bonus-locked', 'rank-maxed', 'bad-amount', 'restricted', 'same-name', 'renamed-today',
      'enhance-locked', 'no-enhance-points', 'enhance-maxed', 'no-enhance-used', 'rejoin-cooldown']) {
      expect(GUILD_ERROR_TEXT[code]).toBeTruthy();
    }
  });

  it('재가입 대기 안내와 오류 문구를 계산한다', () => {
    const now = Date.parse('2026-11-27T00:00:00.000Z');
    expect(guildCooldownInfo(null, now)).toEqual({ active: false, remainingMs: 0, remainingText: null });
    expect(guildCooldownInfo('2026-11-27T00:00:00.000Z', now)).toEqual({ active: false, remainingMs: 0, remainingText: null });
    expect(guildCooldownInfo('2026-11-27T19:42:00.000Z', now)).toEqual({
      active: true,
      remainingMs: 19 * 3_600_000 + 42 * 60_000,
      remainingText: '19시간 42분',
    });

    expect(guildErrorText('rejoin-cooldown', 'approve', '19시간 42분')).toBe('신청한 플레이어가 재가입 대기 중이라 승인할 수 없어요.');
    expect(guildErrorText('rejoin-cooldown', 'create', '19시간 42분')).toBe('재가입 대기 중이라 19시간 42분 뒤에 가입하거나 새 길드를 만들 수 있어요.');
    expect(guildErrorText('rejoin-cooldown', 'join', null)).toBe('재가입 대기 중이라 지금은 가입하거나 새 길드를 만들 수 없어요.');
  });

  it('게스트 거부 안내는 태평양 항로 해금을 알린다', () => {
    expect(GUILD_ERROR_TEXT['account-only']).toBe('길드는 태평양 항로가 열리면 쓸 수 있어요.');
  });
});

describe('길드 성장 화면 모델', () => {
  const growth = (level: number, total: number, floor: number, next: number | null) => ({ level, total, floor, next });

  it('진행 막대는 지금 레벨 안에서 채운 비율과 다음 레벨까지 남은 기여다. 최고 레벨은 가득 차고 남은 기여가 없다', () => {
    expect(growthBar(growth(2, 17_500, 10_000, 25_000))).toEqual({ ratio: 0.5, remaining: 7_500 });
    expect(growthBar(growth(10, 1_200_000, 1_100_000, null))).toEqual({ ratio: 1, remaining: null });
  });

  it('누적 기여와 다음 레벨 문턱을 숫자로 보인다. 최고 레벨은 누적만 보인다', () => {
    expect(growthTotalText(growth(3, 31_000, 25_000, 50_000))).toBe('31,000 / 50,000');
    expect(growthTotalText(growth(10, 1_200_000, 1_100_000, null))).toBe('1,200,000');
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
    expect(dailyContributionRows({ artifacts: [] })).toEqual([
      { label: '명성', value: '2,500' },
      { label: '일반 의뢰', value: '1,000' },
      { label: '네임드 토벌', value: '1,000' },
    ]);
  });

  it('마미 와타의 거울을 가지면 네임드 토벌 상한이 가산만큼 늘어난다', () => {
    expect(dailyContributionRows({ artifacts: ['mami-wata-mirror'] })[2]).toEqual({ label: '네임드 토벌', value: '2,000' });
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
      { text: '나', tone: 'me' }, { text: ' 님이 ' }, { text: '전설 황금 잉어', tone: 'legend' }, { text: '를 낚았어요!' },
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
      [{ text: '길드 스킬 ' }, { text: '희귀 어종 출현 비중', tone: 'skill' }, { text: '이 ' }, { text: '2', tone: 'num' }, { text: '단계가 됐어요!' }],
    ]);
  });

  it('전설 돌연변이 기록은 전설 돌연변이 문구·돌연변이명·variant 톤으로 일반 전설과 구분하고, 미상 어종은 어종으로 폴백한다', () => {
    const at = '2026-11-05T05:20:00.000Z';
    const [day] = logbookDays([
      log(3, 'legendary', at, 'goldcarp', null, 'me', '나'),
      log(2, 'legendary', at, 'goldcarp|variant', null, 'me', '나'),
      log(1, 'legendary', at, 'unknown|variant', null, 'u', '가람'),
    ], 'me');
    expect(day.items[0].parts).toEqual([
      { text: '나', tone: 'me' }, { text: ' 님이 ' }, { text: '전설 황금 잉어', tone: 'legend' }, { text: '를 낚았어요!' },
    ]);
    expect(day.items[1].parts).toEqual([
      { text: '나', tone: 'me' }, { text: ' 님이 ' }, { text: '전설 돌연변이 무지개 잉어', tone: 'variant' }, { text: '를 낚았어요!' },
    ]);
    expect(day.items[2].parts).toEqual([
      { text: '가람', tone: 'nick' }, { text: ' 님이 ' }, { text: '전설 돌연변이 어종', tone: 'variant' }, { text: '을 낚았어요!' },
    ]);
    expect(day.items[0].variant).toBeFalsy();
    expect(day.items[1].variant).toBe(true);
    expect(day.items[2].variant).toBe(true);
  });
});

describe('길드 이름 바꾸기 화면 모델', () => {
  const now = '2026-11-06T03:00:00.000Z';

  it('바꿀 수 있으면 버튼이 열리고 이유가 없다', () => {
    expect(renameButtonState(null, now, 100_000)).toEqual({ disabled: false, reason: null });
  });

  it('오늘 이미 바꿨으면 막고 다시 바꿀 수 있는 시각을 알린다', () => {
    const s = renameButtonState(now, now, 5_000_000);
    expect(s.disabled).toBe(true);
    expect(s.reason).toBe('오늘은 이미 이름을 바꿨어요.\n새벽 4시 이후에 다시 바꿀 수 있어요.');
  });

  it('골드가 모자라면 막고 필요한 골드를 알린다', () => {
    expect(renameButtonState(null, now, 99_999)).toEqual({ disabled: true, reason: '골드가 모자라요.\n이름을 바꾸려면 100,000G가 필요해요.' });
  });
});

describe('길드 이름 바꾸기 항해일지', () => {
  it('새 이름을 강조한 문장이다. 받침 ㄹ로 끝나는 이름은 로를 쓴다', () => {
    const at = '2026-11-05T00:00:00.000Z';
    const entry = (detail: string) => logbookDays([{ id: 1, kind: 'rename', uid: 'u', nick: '가람', detail, value: null, at }], 'me')[0].items[0];
    expect(entry('먼바다').parts).toEqual([{ text: '길드 이름을 ' }, { text: '먼바다', tone: 'skill' }, { text: '로 바꿨어요.' }]);
    expect(entry('불꽃').parts.at(-1)).toEqual({ text: '으로 바꿨어요.' });
    expect(entry('먼바다').quiet).toBe(false);
  });
});

describe('길드 보너스 화면 모델', () => {
  const item = (over: Partial<GuildBonusItem>): GuildBonusItem => {
    const rank = over.rank ?? 0;
    const enhanceRank = over.enhanceRank ?? 0;
    return {
      id: 'sell', unlock: 1, rank, enhanceRank, totalRank: over.totalRank ?? rank + enhanceRank,
      cap: 0, pool: 0, next: null, effect: 0, nextEffect: 0.02, mine: 0, ...over,
    };
  };

  it('길드 스킬 이름', () => {
    expect(Object.values(GUILD_BONUS_NAME)).toEqual(['판매가 보너스', '가방 용량 증가', '네임드 조우 확률', '희귀 어종 출현 비중', '돌연변이 출현 비중']);
  });

  it('효과 값 — 모든 보너스는 %, 희귀 어종은 일반 어종을 줄이므로 −', () => {
    expect(bonusEffectValue('sell', 0.06)).toBe('+6%');
    expect(bonusEffectValue('rare', 0.04)).toBe('−4%');
    expect(bonusEffectValue('mutation', 0.03)).toBe('+3%');
  });

  it('효과 문장 — 출현 비중·조우 확률 용어를 쓰고 희귀 어종은 일반 어종 출현을 줄인다', () => {
    expect(bonusEffectText('sell', 0.06)).toBe('판매가 +6%');
    expect(bonusEffectText('bag', 0.2)).toBe('가방 용량 +20%');
    expect(bonusEffectText('named', 0.05)).toBe('네임드 조우 확률 +5%');
    expect(bonusEffectText('rare', 0.04)).toBe('일반 어종 출현 비중 −4%');
    expect(bonusEffectText('mutation', 0.03)).toBe('돌연변이 출현 비중 +3%');
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

  it('스킬 트리 노드 — 이룬 단계, 모으는 다음 단계(채운 비율), 상한 안의 먼 단계, 상한 위 단계와 자유 강화 테두리', () => {
    const [sell, named, rare] = bonusRows([
      item({ id: 'sell', rank: 2, cap: 4, pool: 125_000, next: 500_000 }),
      item({ id: 'named', unlock: 4, cap: 0 }),
      item({ id: 'rare', unlock: 4, rank: 2, enhanceRank: 3, totalRank: 5, cap: 5 }),
    ]);
    expect(sell.nodes).toEqual([
      { rank: 1, state: 'done', fill: 1, enhanced: false },
      { rank: 2, state: 'done', fill: 1, enhanced: false },
      { rank: 3, state: 'next', fill: 0.25, enhanced: false },
      { rank: 4, state: 'open', fill: 0, enhanced: false },
      { rank: 5, state: 'capped', fill: 0, enhanced: false },
    ]);
    expect(named.nodes.every(n => n.state === 'capped' && !n.enhanced)).toBe(true);
    expect(rare.nodes.map(n => [n.rank, n.state, n.enhanced])).toEqual([
      [1, 'done', true], [2, 'done', true], [3, 'next', true], [4, 'open', false], [5, 'open', false],
    ]);
  });

  it('자유 강화 포인트와 투자·초기화 상태는 일반 길드원에게도 열리고 누적 횟수별 단계 비용이 필요하다', () => {
    const g: GuildInfo = {
      ...guild('member', [member('M', 'member')]),
      growth: { level: 7, total: 350_000, floor: 350_000, next: 550_000 },
      bonuses: [
        item({ id: 'sell', rank: 5, enhanceRank: 1, cap: 5 }),
        item({ id: 'bag', unlock: 2, rank: 2, enhanceRank: 0, cap: 5 }),
        item({ id: 'rare', unlock: 4, rank: 0, enhanceRank: 0, cap: 0 }),
      ],
    };
    const rows = bonusRows(g.bonuses);
    expect(donateDisabledReason(rows[0])).toBe('기본 단계 5단계를 모두 채웠어요.');
    expect(donateDisabledReason(rows[2])).toBe(GUILD_ERROR_TEXT['bonus-locked']);
    expect(donateDisabledReason(bonusRows([item({ id: 'bag', unlock: 2, rank: 3, cap: 3 })])[0])).toBe(GUILD_ERROR_TEXT['rank-maxed']);
    expect(enhancePoolSummary(g)).toEqual({ max: 2, used: 1, remaining: 1, maxSlots: 5 });
    expect(enhanceInvestState(g, rows[1])).toEqual({ canInvest: true, reason: null });

    const expectedCosts: [number, number][] = [
      [0, 100_000],
      [1, 500_000],
      [2, 1_000_000],
      [3, 5_000_000],
      [4, 10_000_000],
      [5, 10_000_000],
    ];
    for (const [enhanceResetCount, cost] of expectedCosts) {
      const target = { ...g, enhanceResetCount };
      expect(enhanceResetState(target, cost - 1), `count ${enhanceResetCount} 부족`).toEqual({
        canReset: false,
        reason: `골드가 모자라요.\n${cost.toLocaleString('ko-KR')}G를 내고 내 자유 강화만 되돌릴 수 있어요.`,
        used: 1,
        cost,
      });
      expect(enhanceResetState(target, cost), `count ${enhanceResetCount} 허용`).toEqual({
        canReset: true,
        reason: null,
        used: 1,
        cost,
      });
    }
  });

  it('자유 강화·초기화 항해일지 문장', () => {
    const at = '2026-11-05T00:00:00.000Z';
    const [day] = logbookDays([
      { id: 2, kind: 'enhance-reset', uid: 'u', nick: '가람', detail: null, value: 2, at },
      { id: 1, kind: 'enhance', uid: 'me', nick: '나', detail: 'rare', value: 3, at },
    ], 'me');
    expect(day.items[0].parts.map(p => p.text).join('')).toBe('가람 님이 길드 스킬 강화를 되돌렸어요.');
    expect(day.items[1].parts.map(p => p.text).join('')).toBe('나 님이 희귀 어종 출현 비중 스킬을 강화 3단계로 올렸어요.');
  });

  it('공통과 개인 트랙 효과, 개인 트리 노드, 초기화 비용 단계표, 잠금 안내 상수를 제공한다', () => {
    const [sell, rare] = bonusRows([
      item({ id: 'sell', rank: 4, enhanceRank: 1, totalRank: 5, cap: 5, effect: 0.1 }),
      item({ id: 'rare', unlock: 4, rank: 0, enhanceRank: 0, totalRank: 0, cap: 0 }),
    ]);
    expect(sell).toMatchObject({
      baseNow: '+8%',
      baseAfter: '+10%',
      enhanceNow: '+2%',
      enhanceAfter: '+4%',
      totalEffect: '+10%',
    });
    expect(rare).toMatchObject({
      baseNow: null,
      baseAfter: null,
      enhanceNow: '0%',
      enhanceAfter: '−2%',
    });
    expect(personalNodes(sell, true, 2)).toEqual([
      { rank: 1, state: 'done' },
      { rank: 2, state: 'next' },
      { rank: 3, state: 'open' },
      { rank: 4, state: 'open' },
      { rank: 5, state: 'open' },
    ]);
    expect(personalNodes(sell, false, 0).every(n => n.state === 'locked')).toBe(true);
    expect(personalNodes(rare, true, 2).every(n => n.state === 'locked')).toBe(true);
    expect(enhanceResetCostRows()).toEqual([
      { label: '1회', value: '10만G' },
      { label: '2회', value: '50만G' },
      { label: '3회', value: '100만G' },
      { label: '4회', value: '500만G' },
      { label: '5회 이상', value: '1,000만G' },
    ]);
    expect(GUILD_ENHANCE_LOCK_NOTE).toBe('길드 Lv.6부터 개인 무료 자유 강화가 열려요.');
  });
});

describe('초대 확인 창', () => {
  const preview = (over: Partial<GuildInvitePreview> = {}): GuildInvitePreview =>
    ({ code: 'K7QX2MAB', name: '새벽선단', level: 3, members: 6, cap: 10, joinMode: 'open', ...over });
  const viewer = { account: true, guild: null as string | null };

  it('없는 코드는 찾지 못했다고 알리고 확인만 둔다', () => {
    expect(inviteDialogView(null, viewer, 'link')).toEqual({ state: 'bad', text: '초대 코드를 찾지 못했어요.\n링크가 맞는지 확인해 주세요.', action: null });
  });

  it('게스트는 태평양 항로가 열려야 들어갈 수 있다고 알린다', () => {
    expect(inviteDialogView(preview(), { account: false, guild: null }, 'link')).toMatchObject({ state: 'guest', action: null,
      text: '길드는 태평양 항로가 열리면 들어갈 수 있어요.\n계정을 연결하거나 로그인해 항로를 열면 이 창이 다시 떠요.' });
  });

  it('다른 길드에 있으면 떠난 뒤에 들어갈 수 있다고 알리고, 같은 길드면 이미 있다고 알린다', () => {
    expect(inviteDialogView(preview(), { account: true, guild: '심해조합' }, 'link')).toMatchObject({ state: 'member', action: null,
      text: '이미 다른 길드(심해조합)에 있어요.\n지금 길드를 떠난 뒤에 들어갈 수 있어요.' });
    expect(inviteDialogView(preview(), { account: true, guild: '새벽선단' }, 'link')).toMatchObject({ state: 'member', action: null,
      text: '이미 새벽선단 길드에 있어요.' });
  });

  it('가입 방식과 인원에 따라 들어가기, 가입 신청, 받지 않음이다', () => {
    expect(inviteDialogView(preview(), viewer, 'code')).toEqual({ state: 'open', action: { label: '들어가기' },
      text: '들어가면 길드 채팅과 길드 스킬을 바로 함께 써요.' });
    expect(inviteDialogView(preview({ joinMode: 'approval' }), viewer, 'code')).toEqual({ state: 'approval', action: { label: '가입 신청' },
      text: '길드장이 승인하면 들어가요.\n신청은 7일 동안 남아요.' });
    expect(inviteDialogView(preview({ joinMode: 'closed' }), viewer, 'code')).toEqual({ state: 'closed', action: null,
      text: '이 길드는 지금 새 길드원을 받지 않아요.' });
    expect(inviteDialogView(preview({ members: 10 }), viewer, 'code')).toEqual({ state: 'full', action: null, text: '길드 인원이 가득 찼어요.' });
  });

  it('초대 링크로 오면 승인 가입 길드도 들어가기이고, 닫힘과 인원 가득은 그대로 받지 않는다', () => {
    expect(inviteDialogView(preview({ joinMode: 'approval' }), viewer, 'link')).toEqual({ state: 'open', action: { label: '들어가기' },
      text: '들어가면 길드 채팅과 길드 스킬을 바로 함께 써요.' });
    expect(inviteDialogView(preview({ joinMode: 'closed' }), viewer, 'link')).toMatchObject({ state: 'closed', action: null });
    expect(inviteDialogView(preview({ joinMode: 'approval', members: 10 }), viewer, 'link')).toMatchObject({ state: 'full', action: null });
  });

  it('재가입 대기 중이면 초대 창은 가입 버튼을 비활성화하고 남은 시간 안내를 보인다', () => {
    expect(inviteDialogView(preview(), { account: true, guild: null, cooldownRemaining: '19시간 42분' }, 'link')).toEqual({
      state: 'cooldown',
      action: null,
      text: '재가입 대기 중이라 19시간 42분 뒤에 가입할 수 있어요.',
    });
    expect(inviteDialogView(preview({ joinMode: 'closed' }), { account: true, guild: null, cooldownRemaining: '19시간 42분' }, 'link'))
      .toMatchObject({ state: 'closed', action: null });
  });
});

describe('공개 길드 목록 화면 모델', () => {
  it('정렬 선택지를 최근 활동순, 레벨순, 여유 인원순 순서로 제공한다', () => {
    expect(PUBLIC_GUILD_SORT_OPTIONS).toEqual([
      { value: 'activity', label: '최근 활동순' },
      { value: 'level', label: '레벨순' },
      { value: 'slots', label: '여유 인원순' },
    ]);
  });

  it('최근 활동 시각을 상대 시간으로 바꾼다', () => {
    const now = Date.parse('2026-11-26T12:00:00.000Z');
    expect(guildActivityText('2026-11-26T11:59:40.000Z', now)).toBe('방금 전');
    expect(guildActivityText('2026-11-26T11:48:00.000Z', now)).toBe('12분 전');
    expect(guildActivityText('2026-11-26T09:00:00.000Z', now)).toBe('3시간 전');
    expect(guildActivityText('2026-11-23T12:00:00.000Z', now)).toBe('3일 전');
  });

  it('바로 가입·승인 신청 확인 창 정보에 기존 대기 신청 취소·변경 경고를 조건부로 붙인다', () => {
    const openItem = {
      guildId: 'g1', name: '파도쉼터', level: 7, members: 8, cap: 10, joinMode: 'open' as const,
      pitch: '다 같이 대어 노려요.', lastActivityAt: '2026-11-26T12:00:00.000Z',
    };
    const pending = { code: 'ABCD2345', name: '은빛항구', requestedAt: '2026-11-25T00:00:00.000Z' };
    expect(publicJoinConfirm(openItem, null)).toMatchObject({
      mode: 'open',
      title: '길드 가입 확인',
      label: '확인',
      guild: openItem,
      pendingCancelWarn: null,
    });
    expect(publicJoinConfirm(openItem, pending)).toMatchObject({
      mode: 'open',
      title: '길드 가입 확인',
      label: '확인',
      guild: openItem,
      pendingWarnTitle: '기존 가입 신청 자동 취소',
      pendingCancelWarn: '은빛항구 길드에 보낸 승인 대기 신청은 바로 가입하면 자동으로 취소돼요.',
    });

    const approvalItem = { ...openItem, guildId: 'g2', name: '심해탐험', joinMode: 'approval' as const };
    expect(publicJoinConfirm(approvalItem, null)).toMatchObject({
      mode: 'approval',
      title: '길드 가입 신청',
      label: '가입 신청',
      guild: approvalItem,
      pendingCancelWarn: null,
    });
    expect(publicJoinConfirm(approvalItem, pending)).toMatchObject({
      mode: 'approval',
      title: '길드 가입 신청',
      label: '가입 신청',
      guild: approvalItem,
      pendingWarnTitle: '기존 가입 신청 변경',
      pendingCancelWarn: '은빛항구 길드에 보낸 승인 대기 신청이 사라지고 이 길드로 신청이 바뀌어요.',
    });
  });

  it('전체 길드 목록 행의 배지, 버튼, 사유, 툴팁 상태를 소속 여부·가입 방식·정원·재가입 대기에 따라 계산한다', () => {
    const base = {
      guildId: 'g1', name: '백경 원정대', level: 12, members: 8, cap: 10, joinMode: 'open' as const,
      pitch: '함께해요.', lastActivityAt: '2026-11-26T12:00:00.000Z',
    };

    // 내 길드
    expect(publicGuildRowState(base, { myGuildId: 'g1' })).toEqual({
      isOwnGuild: true,
      badge: { label: '소속 중', tone: 'gold' },
      action: null,
    });

    // 소속 중 — 다른 길드(자유/승인/닫힘/만석)
    expect(publicGuildRowState({ ...base, guildId: 'g2', joinMode: 'open' }, { myGuildId: 'g1' })).toMatchObject({
      isOwnGuild: false,
      badge: { label: '자유 가입', tone: 'gold-plain' },
      action: { label: '가입', disabled: true, primary: false, reason: null, reasonDanger: false, tooltip: '이미 길드에 소속되어 있어요.' },
    });
    expect(publicGuildRowState({ ...base, guildId: 'g3', joinMode: 'approval' }, { myGuildId: 'g1' })).toMatchObject({
      isOwnGuild: false,
      badge: { label: '승인 가입', tone: 'accent' },
      action: { label: '가입 신청', disabled: true, primary: false, reason: null, reasonDanger: false, tooltip: '이미 길드에 소속되어 있어요.' },
    });
    expect(publicGuildRowState({ ...base, guildId: 'g4', joinMode: 'closed' }, { myGuildId: 'g1' })).toMatchObject({
      isOwnGuild: false,
      badge: { label: '닫힘', tone: 'dim' },
      action: { label: '가입 불가', disabled: true, primary: false, reason: '모집 닫힘', reasonDanger: false, tooltip: '이미 길드에 소속되어 있어요.' },
    });
    expect(publicGuildRowState({ ...base, guildId: 'g5', members: 10, cap: 10 }, { myGuildId: 'g1' })).toMatchObject({
      isOwnGuild: false,
      badge: { label: '만석', tone: 'danger' },
      action: { label: '만석', disabled: true, primary: false, reason: '정원 10/10', reasonDanger: true, tooltip: '이미 길드에 소속되어 있어요.' },
    });

    // 미소속 — 자유/승인/닫힘/만석 + 재가입 대기
    expect(publicGuildRowState({ ...base, joinMode: undefined }, {})).toMatchObject({
      badge: { label: '자유 가입', tone: 'gold-plain' },
      action: { label: '가입', disabled: false, primary: true, reason: null, tooltip: null },
    });
    expect(publicGuildRowState({ ...base, joinMode: 'approval' }, {})).toMatchObject({
      badge: { label: '승인 가입', tone: 'accent' },
      action: { label: '가입 신청', disabled: false, primary: false, reason: null, tooltip: null },
    });
    expect(publicGuildRowState({ ...base, joinMode: 'closed' }, {})).toMatchObject({
      badge: { label: '닫힘', tone: 'dim' },
      action: { label: '가입 불가', disabled: true, primary: false, reason: '모집 닫힘', reasonDanger: false, tooltip: null },
    });
    expect(publicGuildRowState({ ...base, members: 10, cap: 10 }, {})).toMatchObject({
      badge: { label: '만석', tone: 'danger' },
      action: { label: '만석', disabled: true, primary: false, reason: '정원 10/10', reasonDanger: true, tooltip: null },
    });
    expect(publicGuildRowState({ ...base, joinMode: 'approval' }, { cooldownTooltip: '재가입 대기 중이라 1시간 뒤에 이용할 수 있어요.' })).toMatchObject({
      badge: { label: '승인 가입', tone: 'accent' },
      action: { label: '가입 신청', disabled: true, primary: false, tooltip: '재가입 대기 중이라 1시간 뒤에 이용할 수 있어요.' },
    });
  });
});
