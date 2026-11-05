import type { GuildBonusItem, GuildInfo, GuildLogItem, GuildMemberItem, GuildOp } from '../../../platform/api';
import { GUILD_BONUS_IDS, GUILD_LEVEL_FLOORS, bonusUnlockLevel, handoverOutcome, removalOutcome } from '../../../game/rules/guild';
import type { GuildBonusId } from '../../../game/rules/guild';
import { FISH } from '../../../game/content/fish';
import { bountyById } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';

export type { GuildBonusItem, GuildInfo, GuildLogItem, GuildMemberItem, GuildOp };

// 길드 화면 모델 — 길드원 묶음, 길드원별로 열리는 관리 동작, 초대 코드 남은 시간, 거부 안내 문장,
// 레벨 진행·레벨 사다리, 보너스 줄과 효과 문장, 항해일지 문장. 보너스 값은 서버 응답을 그대로 보인다.

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

/** 초대 코드를 쓸 수 있는 남은 시간 */
export function inviteLeftText(expiresAt: string, nowMs: number): string {
  const mins = Math.floor((Date.parse(expiresAt) - nowMs) / 60_000);
  if (mins <= 0) return '만료됨';
  return mins >= 60 ? `${Math.floor(mins / 60)}시간 남음` : `${mins}분 남음`;
}

/** 요청 실패 코드를 안내 문장으로 */
export const GUILD_ERROR_TEXT: Record<string, string> = {
  'bad-name': '길드 이름은 한글 1~8자 또는 영문 2~16자로, 한글·영문·숫자와 - _만 쓸 수 있어요.',
  'name-taken': '이미 쓰이는 길드 이름이에요.',
  'already-in-guild': '이미 길드에 들어가 있어요. 한 사람은 길드 하나에만 들어갈 수 있어요.',
  'bad-code': '초대 코드를 찾지 못했어요. 코드가 맞는지, 만료되지 않았는지 확인해 주세요.',
  'guild-full': '길드 인원이 가득 찼어요.',
  'not-leader': '길드장만 할 수 있어요.',
  'not-member': '길드원을 찾지 못했어요. 창을 다시 열어 주세요.',
  'handover-first': '다른 길드원이 있으면 길드장을 넘긴 뒤에 떠날 수 있어요.',
  self: '자기 자신에게는 넘길 수 없어요.',
  'account-only': '길드는 계정을 만든 뒤에 쓸 수 있어요.',
  'not-enough-gold': '골드가 모자라요.',
  'bonus-locked': '아직 열리지 않은 보너스예요. 길드 레벨이 오르면 열려요.',
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

/** 보너스의 화면 이름 */
export const GUILD_BONUS_NAME: Record<GuildBonusId, string> = {
  sell: '판매가', bag: '가방 용량', named: '네임드 조우 보너스', rare: '희귀 어종 보너스', mutation: '돌연변이 보너스',
};

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

/** 효과 값 하나의 문장 — 비율은 %, 돌연변이는 확률에 더하는 %p */
export function bonusEffectText(id: GuildBonusId, value: number): string {
  switch (id) {
    case 'sell': return `판매가 +${pct(value)}`;
    case 'bag': return `가방 용량 +${pct(value)}`;
    case 'named': return `네임드 조우 +${pct(value)}`;
    case 'rare': return `일반 어종 가중치 −${pct(value)}`;
    case 'mutation': return `돌연변이 확률 +${pct(value)}p`;
  }
}

/** 받는 보너스 문장 — 1단계 이상인 보너스만, 해금 순 */
export function activeEffectLines(bonuses: readonly GuildBonusItem[]): string[] {
  return bonuses.filter(b => b.rank > 0).map(b => bonusEffectText(b.id, b.effect));
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
      now: b.rank > 0 ? bonusEffectText(b.id, b.effect) : null,
      after: b.nextEffect === null ? null : bonusEffectText(b.id, b.nextEffect),
      ratio, need: canDonate && b.next !== null ? b.next - b.pool : null, canDonate, nodes,
    };
  });
}

/** 기부 입력의 빠른 금액 — 10만·50만 더하기와 다음 단계까지 남은 만큼 */
export const DONATION_STEPS = [100_000, 500_000] as const;

/** 기부 순위 — 보너스를 합친 사람별 전체 기부액. 같은 금액은 같은 순위다 */
export function donorRanking(donors: readonly GuildInfo['donors'][number][], me: string):
  { rank: number; nickname: string | null; value: number; me: boolean }[] {
  return donors.map(d => ({
    rank: donors.findIndex(o => o.gold === d.gold) + 1,
    nickname: d.nick, value: d.gold, me: d.uid === me,
  }));
}

export interface LevelStep {
  level: number;
  /** 이 레벨에 필요한 누적 기여도 */
  floor: number;
  /** 이 레벨에서 새로 열리는 보너스와 늘어나는 단계 상한 */
  perks: string[];
  state: 'done' | 'current' | 'next' | 'locked';
}

/** 레벨 사다리 — 레벨마다 문턱, 새로 열리는 보너스, 보너스 단계 상한 */
export function levelSteps(growth: GuildInfo['growth']): LevelStep[] {
  return GUILD_LEVEL_FLOORS.map((floor, i) => {
    const level = i + 1;
    const state = level < growth.level ? 'done' : level === growth.level ? 'current' : level === growth.level + 1 ? 'next' : 'locked';
    const opened = GUILD_BONUS_IDS.filter(id => bonusUnlockLevel(id) === level).map(id => `${GUILD_BONUS_NAME[id]} 열림`);
    return { level, floor, perks: level > 1 ? [...opened, `보너스 단계 상한 ${level}`] : opened, state };
  });
}

/** 항해일지 한 줄의 문장 */
export function logLine(log: GuildLogItem): string {
  const who = `${log.nick ?? '이름 없음'} 님`;
  switch (log.kind) {
    case 'join': return `${who}이 길드에 들어왔어요.`;
    case 'leave': return `${who}이 길드를 떠났어요.`;
    case 'kick': return `${who}이 길드에서 내보내졌어요.`;
    case 'legendary': {
      const fish = FISH.find(f => f.id === log.detail);
      return `${who}이 전설 ${fish?.name ?? '어종'} 낚시에 성공했어요!`;
    }
    case 'named': {
      const quest = log.detail ? bountyById(log.detail) : undefined;
      const named = quest?.targetFish ? namedById(quest.targetFish) : undefined;
      return `${who}이 네임드 ${named?.name ?? '어종'} 토벌에 성공했어요!`;
    }
    case 'donate':
      return `${who}이 ${bonusName(log.detail)}에 ${(log.value ?? 0).toLocaleString('ko-KR')}골드를 기부했어요.`;
    case 'bonus-up':
      return `${who}의 기부로 ${bonusName(log.detail)} ${log.value ?? 0}단계가 됐어요!`;
  }
}

const bonusName = (id: string | null): string =>
  (GUILD_BONUS_IDS as readonly string[]).includes(id ?? '') ? GUILD_BONUS_NAME[id as GuildBonusId] : '보너스';

/** 항해일지 줄이 남은 뒤 지난 시간 */
export function logAgoText(at: string, nowMs: number): string {
  const mins = Math.max(0, Math.floor((nowMs - Date.parse(at)) / 60_000));
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}
