import type {
  GuildBonusItem, GuildInfo, GuildInvitePreview, GuildJoinRequestItem, GuildLogItem, GuildMemberItem, GuildMyRequest, GuildOp,
} from '../../../platform/api';
import type { ServerMessage } from '../../../game/rules/live';
import {
  DEFAULT_GUILD_PITCH, GUILD_BONUS_IDS, GUILD_JOIN_REQUEST_TTL_MS, GUILD_PITCH_MAX, guildDailyContributionCaps, guildLinkPath,
  handoverOutcome, joinOutcome, joinRequestDaysLeft, removalOutcome,
} from '../../../game/rules/guild';
import type { GuildBonusId, GuildJoinMode } from '../../../game/rules/guild';
import { FISH } from '../../../game/content/fish';
import { bountyById } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';
import { josa } from '../../../shared/lib/josa';

export type { GuildBonusItem, GuildInfo, GuildInvitePreview, GuildLogItem, GuildMemberItem, GuildMyRequest, GuildOp };

// 길드 화면 모델: 길드원 표, 길드원별로 열리는 관리 동작과 확인 문장, 가입 방식과 초대 링크, 가입 신청 줄, 초대 확인 창 상태,
// 실시간 길드 알림 문장, 거부 안내 문장,
// 레벨 진행, 길드 스킬 줄과 효과 값, 날짜별 항해일지. 길드 스킬 값은 서버 응답을 그대로 보인다.

const num = (n: number) => n.toLocaleString('ko-KR');

/** 길드원의 화면 이름 — 닉네임이 없으면 '이름 없음' */
export const memberName = (m: { nick: string | null }): string => m.nick ?? '이름 없음';

/** 지금 길드원과 떠난 선원. 순서는 서버가 정한 그대로다 */
export function splitMembers(members: readonly GuildMemberItem[]): { active: GuildMemberItem[]; departed: GuildMemberItem[] } {
  return { active: members.filter(m => m.leftAt === null), departed: members.filter(m => m.leftAt !== null) };
}

/** 그 길드원에게 내가 할 수 있는 관리 동작 */
export function memberActions(guild: GuildInfo, me: string, target: GuildMemberItem): { kick: boolean; handover: boolean } {
  const actor = { uid: me, role: guild.role };
  const count = splitMembers(guild.members).active.length;
  return {
    kick: removalOutcome(actor, target, count) === 'kick',
    handover: handoverOutcome(actor, target.uid) === 'ok',
  };
}

/** 내가 떠나기를 누르면 어떻게 되는가 — 떠남, 길드 없어짐, 위임 먼저 */
export function leaveOutcome(guild: GuildInfo, me: string): 'leave' | 'dissolve' | 'handover-first' {
  const actor = { uid: me, role: guild.role };
  const outcome = removalOutcome(actor, actor, splitMembers(guild.members).active.length);
  return outcome === 'dissolve' || outcome === 'handover-first' ? outcome : 'leave';
}

/** 확인 창 하나 — 제목, 확정 버튼 이름, 본문, 확정하면 보낼 요청, 성공 알림 */
export interface GuildConfirm { title: string; label: string; text: string; op: GuildOp; done: string }

/** 길드장이 다른 길드원에게 하는 넘기기·내보내기의 확인 창 */
export function memberConfirm(guild: GuildInfo, target: GuildMemberItem, action: 'handover' | 'kick'): GuildConfirm {
  const name = memberName(target);
  return action === 'handover'
    ? { title: '길드장 넘기기', label: '넘기기', op: { op: 'handover', guildId: guild.id, uid: target.uid },
      text: `${name} 님에게 길드장을 넘길까요? 나는 길드원이 되고, 되돌리려면 새 길드장이 다시 넘겨야 해요.`,
      done: `${name} 님에게 길드장을 넘겼어요.` }
    : { title: '길드원 내보내기', label: '내보내기', op: { op: 'remove', guildId: guild.id, uid: target.uid },
      text: `${name} 님을 길드에서 내보낼까요? 쌓은 기여와 기록은 길드에 남아요.`,
      done: `${name} 님을 내보냈어요.` };
}

/** 떠나기의 확인 창 — 혼자 남은 길드면 해산이다. 길드장을 먼저 넘겨야 하면 null */
export function leaveConfirm(guild: GuildInfo, me: string): GuildConfirm | null {
  const outcome = leaveOutcome(guild, me);
  if (outcome === 'handover-first') return null;
  const op: GuildOp = { op: 'remove', guildId: guild.id, uid: me };
  return outcome === 'dissolve'
    ? { title: '길드 해산', label: '해산', op,
      text: `혼자 남은 길드라 떠나면 ${guild.name} 길드가 없어지고 길드 채팅도 지워져요. 떠날까요?`,
      done: `${guild.name} 길드를 해산했어요.` }
    : { title: '길드 떠나기', label: '떠나기', op,
      text: `${guild.name} 길드를 떠날까요? 쌓은 기여와 기록은 길드에 남고, 다시 들어오려면 길드 코드가 필요해요.`,
      done: `${guild.name} 길드를 떠났어요.` };
}

// ── 가입 방식과 초대 링크 ──────────────────────────────────────────

/** 가입 방식의 이름과 한 줄 설명 */
export const GUILD_JOIN_MODE_TEXT: Record<GuildJoinMode, { name: string; desc: string }> = {
  open: { name: '자유 가입', desc: '링크나 코드로 바로 들어와요.' },
  approval: { name: '승인 가입', desc: '신청을 받고 길드장이 승인해요.' },
  closed: { name: '닫힘', desc: '새 길드원을 받지 않아요.' },
};

/** 초대 링크 — 서비스 주소에 길드 코드 경로를 붙인다 */
export const guildLinkUrl = (origin: string, code: string): string => `${origin}${guildLinkPath(code)}`;

/** 링크 복사로 넣는 글: 권유 문구(비었으면 기본 문구) 다음 줄에 링크 */
export const inviteShareText = (pitch: string | null, url: string): string => `${pitch ?? DEFAULT_GUILD_PITCH}\n${url}`;

/** 권유 문구 입력의 기본 문구와 길이 상한 */
export const GUILD_PITCH_PLACEHOLDER = DEFAULT_GUILD_PITCH;
export const GUILD_PITCH_LIMIT = GUILD_PITCH_MAX;

/** 가입 신청 줄 — 이름, 신청 시각(한국 시간 "11월 5일 21:40"), 사라지기까지 남은 날 수 */
export interface RequestRow { uid: string; name: string; when: string; daysLeft: number }
const REQUEST_TIME = new Intl.DateTimeFormat('ko-KR',
  { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function requestRows(requests: readonly GuildJoinRequestItem[], nowISO: string): RequestRow[] {
  return requests.map(r => ({ uid: r.uid, name: memberName(r), when: REQUEST_TIME.format(new Date(r.requestedAt)),
    daysLeft: joinRequestDaysLeft(r.requestedAt, nowISO) }));
}

/** 가입 신청이 남는 기간 안내 */
export const GUILD_REQUEST_RULE = `신청은 ${GUILD_JOIN_REQUEST_TTL_MS / 86_400_000}일 동안 남고, 처리하지 않으면 사라져요.`;

/** 초대 확인 창의 상태, 안내 문장, 확정 버튼(없으면 확정할 수 없다) */
export interface InviteDialogView {
  state: 'bad' | 'guest' | 'member' | 'closed' | 'full' | 'open' | 'approval';
  text: string;
  action: { label: string } | null;
}

/**
 * 초대 확인 창이 보일 것. preview가 null이면 없는 코드다.
 * @param viewer account는 계정 유저인지, guild는 지금 속한 길드 이름(없으면 null)
 */
export function inviteDialogView(preview: GuildInvitePreview | null, viewer: { account: boolean; guild: string | null }): InviteDialogView {
  if (!preview) return { state: 'bad', text: '초대 코드를 찾지 못했어요. 링크가 맞는지 확인해 주세요.', action: null };
  if (!viewer.account) {
    return { state: 'guest', text: '길드는 계정이 있어야 들어갈 수 있어요. 계정을 만들거나 로그인하면 이 창이 다시 떠요.', action: null };
  }
  if (viewer.guild !== null) {
    return { state: 'member', action: null, text: viewer.guild === preview.name
      ? `이미 ${preview.name} 길드에 있어요.`
      : `이미 다른 길드(${viewer.guild})에 있어요. 지금 길드를 떠난 뒤에 들어갈 수 있어요.` };
  }
  const outcome = joinOutcome(preview.joinMode, preview.members);
  if (outcome === 'closed') return { state: 'closed', text: '이 길드는 지금 새 길드원을 받지 않아요.', action: null };
  if (outcome === 'guild-full') return { state: 'full', text: '길드 인원이 가득 찼어요.', action: null };
  return outcome === 'join'
    ? { state: 'open', text: '들어가면 길드 채팅과 길드 스킬을 바로 함께 써요.', action: { label: '들어가기' } }
    : { state: 'approval', text: `길드장이 승인하면 들어가요. 신청은 ${GUILD_JOIN_REQUEST_TTL_MS / 86_400_000}일 동안 남아요.`, action: { label: '가입 신청' } };
}

/** 실시간 길드 알림 한 줄 — 가입 신청 도착(길드장), 승인과 거절(신청한 사람) */
export function guildAlertText(e: Extract<ServerMessage, { t: 'guild' }>): string {
  if (e.kind === 'request') return `${e.nick ?? '이름 없음'} 님이 ${e.guild} 길드에 가입을 신청했어요.`;
  return e.kind === 'approved' ? `${e.guild} 길드 가입이 승인됐어요.` : `${e.guild} 길드 가입 신청이 거절됐어요.`;
}

/** 요청 실패 코드를 안내 문장으로 */
export const GUILD_ERROR_TEXT: Record<string, string> = {
  'bad-name': '길드 이름은 한글 1~8자 또는 영문 2~16자로, 한글, 영문, 숫자와 - _만 쓸 수 있어요.',
  'name-taken': '이미 쓰이는 길드 이름이에요.',
  'already-in-guild': '이미 길드에 들어가 있어요. 한 사람은 길드 하나에만 들어갈 수 있어요.',
  'bad-code': '길드 코드를 찾지 못했어요. 코드가 맞는지 확인해 주세요.',
  'guild-closed': '이 길드는 지금 새 길드원을 받지 않아요.',
  'no-request': '처리할 가입 신청을 찾지 못했어요. 이미 처리했거나 기간이 지났어요.',
  'bad-pitch': `권유 문구는 ${GUILD_PITCH_MAX}자까지 쓸 수 있어요.`,
  'bad-join-mode': '가입 방식을 다시 골라 주세요.',
  'rate-limited': '요청이 너무 많아요. 잠시 뒤 다시 해 주세요.',
  'guild-full': '길드 인원이 가득 찼어요.',
  'not-leader': '길드장만 할 수 있어요.',
  'not-member': '길드원을 찾지 못했어요. 창을 다시 열어 주세요.',
  'handover-first': '다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.',
  self: '자기 자신에게는 넘길 수 없어요.',
  'account-only': '길드는 계정을 만든 뒤에 쓸 수 있어요.',
  'not-enough-gold': '골드가 모자라요.',
  'bonus-locked': '아직 열리지 않은 길드 스킬이에요. 길드 레벨이 오르면 열려요.',
  'rank-maxed': '지금 길드 레벨에서 올릴 수 있는 단계를 모두 채웠어요. 길드 레벨이 오르면 더 올릴 수 있어요.',
  'bad-amount': '기부할 골드를 1 이상의 정수로 입력해 주세요.',
  restricted: '이용이 제한된 계정은 기부할 수 없어요.',
};

// ── 성장과 항해일지 ──────────────────────────────────────────────

/** 레벨 진행 막대 — 지금 레벨 안에서 채운 비율과 다음 레벨까지 남은 기여. 최고 레벨이면 가득 차고 남은 기여가 없다 */
export function growthBar(growth: GuildInfo['growth']): { ratio: number; remaining: number | null } {
  if (growth.next === null) return { ratio: 1, remaining: null };
  return { ratio: (growth.total - growth.floor) / (growth.next - growth.floor), remaining: growth.next - growth.total };
}

/** 누적 기여와 다음 레벨 문턱 — 최고 레벨이면 누적 기여만 */
export function growthTotalText(growth: GuildInfo['growth']): string {
  return growth.next === null ? num(growth.total) : `${num(growth.total)} / ${num(growth.next)}`;
}

/** 진행 막대 도움말: 레벨이 오르는 조건과 길드 스킬의 관계. 하루 기여 상한은 오늘 기여 도움말이 맡는다 */
export const GUILD_LEVEL_HELP = '길드원 모두가 쌓은 기여가 다음 문턱에 닿으면 길드 레벨이 올라요. '
  + '레벨이 오르면 길드 스킬이 하나씩 열리고, 스킬마다 올릴 수 있는 단계 상한도 올라가요.';

/** 오늘 기여 도움말: 한 사람이 하루에 쌓을 수 있는 기여의 갈래별 상한 */
export function dailyContributionRows(): { label: string; value: string }[] {
  const caps = guildDailyContributionCaps();
  return [
    { label: '명성', value: num(caps.fame) },
    { label: '일반 의뢰', value: num(caps.general) },
    { label: '네임드 토벌', value: num(caps.named) },
  ];
}

/** 길드 스킬의 화면 이름 */
export const GUILD_BONUS_NAME: Record<GuildBonusId, string> = {
  sell: '판매가 보너스', bag: '가방 용량 증가', named: '네임드 조우 확률', rare: '희귀 어종 확률', mutation: '돌연변이 확률',
};

/** 길드 스킬이 하는 일 */
export const GUILD_BONUS_TIP: Record<GuildBonusId, string> = {
  sell: '물고기를 팔 때 받는 골드가 늘어요.',
  bag: '배의 가방 칸이 늘어요.',
  named: '네임드를 만날 확률이 올라가요.',
  rare: '일반 등급 물고기가 걸릴 확률을 줄여요.',
  mutation: '돌연변이가 나올 확률이 올라가요.',
};

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** 효과 값 하나: 비율은 %, 돌연변이는 확률에 더하는 %p, 희귀 어종은 일반 어종 가중치를 줄이므로 − */
export function bonusEffectValue(id: GuildBonusId, value: number): string {
  if (id === 'rare') return `−${pct(value)}`;
  return id === 'mutation' ? `+${pct(value)}p` : `+${pct(value)}`;
}

const EFFECT_LABEL: Record<GuildBonusId, string> = {
  sell: '판매가', bag: '가방 용량', named: '네임드 조우', rare: '일반 어종 가중치', mutation: '돌연변이 확률',
};

/** 효과 문장: 무엇이 얼마나 바뀌는지 */
export function bonusEffectText(id: GuildBonusId, value: number): string {
  return `${EFFECT_LABEL[id]} ${bonusEffectValue(id, value)}`;
}

/**
 * 스킬 트리 노드 하나(단계 1~5). done은 이른 단계, next는 지금 모으는 다음 단계(fill = 모인 비율),
 * open은 상한 안이지만 아직 먼 단계, capped는 길드 레벨 상한 위이거나 열리지 않은 보너스의 단계다.
 */
export interface BonusNode { rank: number; state: 'done' | 'next' | 'open' | 'capped'; fill: number }

export interface BonusRow extends GuildBonusItem {
  name: string;
  /** 길드 레벨이 해금 레벨에 못 미친다 */
  locked: boolean;
  /** 지금 효과(0단계면 null)와 다음 단계 효과(5단계면 null) */
  now: string | null;
  after: string | null;
  /** 다음 단계 비용 대비 모인 골드(0~1). 더 오를 수 없으면 0 */
  ratio: number;
  /** 다음 단계까지 남은 골드. 기부할 수 없으면 null */
  need: number | null;
  /** 지금 기부할 수 있는가 — 열렸고 단계가 상한(길드 레벨) 아래다 */
  canDonate: boolean;
  /** 단계 1~5의 노드(위에서 아래로) */
  nodes: BonusNode[];
}

/** 보너스 탭의 열 — 해금 순 */
export function bonusRows(bonuses: readonly GuildBonusItem[]): BonusRow[] {
  return bonuses.map(b => {
    const canDonate = b.cap > 0 && b.rank < b.cap && b.next !== null;
    const ratio = canDonate && b.next !== null ? Math.min(1, b.pool / b.next) : 0;
    const nodes = GUILD_BONUS_IDS.map((_, i): BonusNode => {
      const rank = i + 1;
      if (rank <= b.rank) return { rank, state: 'done', fill: 1 };
      if (rank > b.cap) return { rank, state: 'capped', fill: 0 };
      return rank === b.rank + 1 ? { rank, state: 'next', fill: ratio } : { rank, state: 'open', fill: 0 };
    });
    return {
      ...b, name: GUILD_BONUS_NAME[b.id], locked: b.cap === 0,
      now: b.rank > 0 ? bonusEffectValue(b.id, b.effect) : null,
      after: b.nextEffect === null ? null : bonusEffectValue(b.id, b.nextEffect),
      ratio, need: canDonate && b.next !== null ? b.next - b.pool : null, canDonate, nodes,
    };
  });
}

/** 기부 입력의 빠른 금액 — 10만·50만 더하기와 다음 단계까지 남은 만큼 */
export const DONATION_STEPS = [100_000, 500_000] as const;

/** 길드원 표 한 줄 */
export interface MemberRow {
  uid: string; name: string; leader: boolean; me: boolean; online: boolean;
  /** 오늘 기여와 누적 기여 */
  today: number; total: number;
  /** 길드 스킬에 기부한 골드 합 */
  gave: number;
}

/** 길드원 표: 지금 길드원만 서버 순서대로, 사람별 전체 기부를 붙인다 */
export function memberRows(guild: GuildInfo, me: string): MemberRow[] {
  return splitMembers(guild.members).active.map(m => ({
    uid: m.uid, name: memberName(m), leader: m.role === 'leader', me: m.uid === me, online: m.online,
    today: m.contribution.today, total: m.contribution.total,
    gave: guild.donors.find(d => d.uid === m.uid)?.gold ?? 0,
  }));
}

/** 항해일지 문장 조각. tone이 없으면 보통 글자다 */
export interface LogPart { text: string; tone?: 'nick' | 'me' | 'legend' | 'named' | 'skill' | 'num' }
export interface LogEntry {
  id: number; kind: GuildLogItem['kind'];
  /** 한국 시각 HH:MM */
  time: string;
  parts: LogPart[];
  /** 떠남·내보냄처럼 낮춰 보일 줄 */
  quiet: boolean;
}

const KST_MS = 9 * 3600_000;
const kst = (at: string) => new Date(Date.parse(at) + KST_MS);
const two = (n: number) => String(n).padStart(2, '0');

const skillName = (id: string | null): string =>
  (GUILD_BONUS_IDS as readonly string[]).includes(id ?? '') ? GUILD_BONUS_NAME[id as GuildBonusId] : '길드 스킬';

function logParts(log: GuildLogItem, me: string): LogPart[] {
  const who: LogPart = { text: memberName(log), tone: log.uid === me ? 'me' : 'nick' };
  switch (log.kind) {
    case 'join': return [who, { text: ' 님이 길드에 들어왔어요.' }];
    case 'leave': return [who, { text: ' 님이 길드를 떠났어요.' }];
    case 'kick': return [who, { text: ' 님이 길드에서 내보내졌어요.' }];
    case 'legendary': {
      const fish = FISH.find(f => f.id === log.detail)?.name ?? '어종';
      return [who, { text: ' 님이 ' }, { text: `전설 ${fish}`, tone: 'legend' }, { text: `${josa(fish, '을/를')} 낚았어요!` }];
    }
    case 'named': {
      const quest = log.detail ? bountyById(log.detail) : undefined;
      const named = (quest?.targetFish ? namedById(quest.targetFish)?.name : undefined) ?? '어종';
      return [who, { text: ' 님이 ' }, { text: `네임드 ${named}`, tone: 'named' }, { text: `${josa(named, '을/를')} 토벌했어요!` }];
    }
    case 'donate':
      return [who, { text: ' 님이 ' }, { text: skillName(log.detail), tone: 'skill' }, { text: '에 ' },
        { text: `${num(log.value ?? 0)}G`, tone: 'num' }, { text: '를 기부했어요.' }];
    case 'bonus-up': {
      const skill = skillName(log.detail);
      return [{ text: '길드 스킬 ' }, { text: skill, tone: 'skill' }, { text: `${josa(skill, '이/가')} ` },
        { text: String(log.value ?? 0), tone: 'num' }, { text: '단계가 됐어요!' }];
    }
  }
}

/** 항해일지: 한국 날짜마다 묶는다. 서버가 보낸 최신 순서를 그대로 둔다 */
export function logbookDays(logbook: readonly GuildLogItem[], me: string): { day: string; items: LogEntry[] }[] {
  const days: { day: string; items: LogEntry[] }[] = [];
  for (const log of logbook) {
    const d = kst(log.at);
    const day = `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
    const entry: LogEntry = {
      id: log.id, kind: log.kind, time: `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`,
      parts: logParts(log, me), quiet: log.kind === 'leave' || log.kind === 'kick',
    };
    const last = days.at(-1);
    if (last?.day === day) last.items.push(entry);
    else days.push({ day, items: [entry] });
  }
  return days;
}
