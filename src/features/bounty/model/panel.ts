import { artifactOfZone } from '../../../game/content/artifacts';
import {
  bountyById, bountyKindOf, dailyQuestFor, zoneOfPort,
} from '../../../game/content/bounties';
import type { BountyDifficulty, BountyKind, BountyPort, BountyQuest } from '../../../game/content/bounties';
import { namedById, namedFishOf } from '../../../game/content/named';
import { zoneById } from '../../../game/content/zones';
import { ticketRemainingMs } from '../../../game/rules/challenge';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP, bountyDailyCap } from '../../../game/rules/balance';
import { formDiscovered, licenseConditions } from '../../../game/rules/logic';
import type { GameState, LicenseCondition } from '../../../game/rules/logic';
import { GAME_DAY_RESET_TEXT } from '../../../game/rules/time';
import type { BountySnapshot } from './types';

/** 일반 의뢰 난이도의 화면 이름 */
export const DIFFICULTY_NAME: Record<Exclude<BountyDifficulty, 'named'>, string> = {
  easy: '쉬움', normal: '보통', hard: '어려움',
};

/** 의뢰의 사람이 읽는 이름 — 토스트·안내용. 일반 의뢰는 "구역 난이도 의뢰", 네임드는 "구역 네임드 토벌" */
export function questLabel(quest: Pick<BountyQuest, 'zone' | 'difficulty'>): string {
  const zone = zoneById(quest.zone)?.shortName ?? quest.zone;
  return quest.difficulty === 'named' ? `${zone} 네임드 토벌` : `${zone} ${DIFFICULTY_NAME[quest.difficulty]} 의뢰`;
}

export interface BountyPanelInput {
  game: GameState;
  port: BountyPort;
  uid: string | null;
  day: string;
  nowMs: number;
  snapshot: BountySnapshot | null;
}

export interface BountyPanelData {
  zone: NonNullable<ReturnType<typeof zoneOfPort>>;
  /** 오늘 남은 클리어 횟수 — 일반 의뢰. 스냅샷이 없으면 null */
  leftAll: number | null;
  /** 오늘 남은 클리어 횟수 — 네임드 토벌. 스냅샷이 없으면 null */
  leftNamed: number | null;
  dailyCap: number;
  namedDailyCap: number;
  /** 난이도 칸에 보일 의뢰 — 그 칸에서 수주 중인 의뢰가 있으면 오늘의 의뢰 대신 그것이다.
   *  날이 바뀐 뒤에도 조건을 채운 의뢰를 마칠 수 있어야 한다 */
  offers: Record<BountyDifficulty, BountyQuest | undefined>;
  progressOf: (questId: string) => number;
  /** 수주 중인가 — 수주하면 진행 행(진행도 0)이 생기므로 행의 존재가 곧 수주다 */
  isAccepted: (questId: string) => boolean;
  basicConds: LicenseCondition[];
  namedConds: LicenseCondition[];
  basicOpen: boolean;
  namedOpen: boolean;
  canTake: boolean;
  canTakeNamed: boolean;
  /** 수주 버튼이 갈래 단위로 막힌 이유 — 한도를 다 썼거나 다른 구역에서 수주 중일 때만 있다 */
  notice: Record<BountyKind, string | null>;
  ticketMins: number | null;
  hasTicket: boolean;
  relic: ReturnType<typeof artifactOfZone>;
  relicOwned: boolean;
  relicMats: number;
}

/** 오늘 남은 클리어 횟수 — 일반 의뢰와 네임드 토벌. 스냅샷이 없으면 알 수 없으므로 null */
export function clearsLeft(snapshot: BountySnapshot | null): { general: number; named: number } | null {
  if (!snapshot) return null;
  return {
    general: Math.max(0, bountyDailyCap('general') - snapshot.clearsToday.general),
    named: Math.max(0, bountyDailyCap('named') - snapshot.clearsToday.named),
  };
}

const KIND_SUBJECT: Record<BountyKind, string> = { general: '일반 의뢰가', named: '네임드 토벌이' };
const CLEARED_NOTICE: Record<BountyKind, string> = {
  general: `오늘 일반 의뢰는 이미 마쳤어요. ${GAME_DAY_RESET_TEXT}가 지나면 다시 수주할 수 있어요.`,
  named: `오늘 네임드 토벌은 이미 마쳤어요. ${GAME_DAY_RESET_TEXT}가 지나면 다시 수주할 수 있어요.`,
};
/** 이 판의 다른 난이도 칸이 왜 막혔는지 — 네임드는 구역마다 한 칸이라 일반 의뢰만 해당한다 */
const ONE_AT_A_TIME_NOTICE = '일반 의뢰는 한 번에 하나만 수주할 수 있어요. 진행 중인 의뢰를 먼저 마쳐 주세요.';
const elsewhereNotice = (kind: BountyKind, held: BountyQuest): string =>
  `${zoneById(held.zone)?.shortName ?? held.zone}에서 수주한 ${KIND_SUBJECT[kind]} 있어요. 그 구역의 수배판에서 먼저 마쳐 주세요.`;

/** 오늘 의뢰판의 데이터·조건·진행 상태를 모은다. */
export function selectBountyPanelData({
  game, port, uid, day, nowMs, snapshot,
}: BountyPanelInput): BountyPanelData {
  const zone = zoneOfPort(port)!;
  const who = uid ?? 'local';
  const difficulties: BountyDifficulty[] = ['easy', 'normal', 'hard', 'named'];
  const left = clearsLeft(snapshot);
  const leftAll = left?.general ?? null;
  const leftNamed = left?.named ?? null;
  // 갈래마다 수주 중인 의뢰 하나 — 어느 구역의 것이든 같은 갈래의 새 수주를 막는다
  const holding: Record<BountyKind, BountyQuest | undefined> = { general: undefined, named: undefined };
  for (const row of snapshot?.progress ?? []) {
    const held = bountyById(row.questId);
    if (held) holding[bountyKindOf(held)] ??= held;
  }
  const heldHere = (difficulty: BountyDifficulty): BountyQuest | undefined =>
    Object.values(holding).find(q => q?.zone === zone && q.difficulty === difficulty);
  const offers = Object.fromEntries(difficulties.map(difficulty => [
    difficulty, heldHere(difficulty) ?? dailyQuestFor(zone, difficulty, who, day),
  ])) as Record<BountyDifficulty, BountyQuest | undefined>;
  const shown = new Set(Object.values(offers).map(q => q?.id));
  const noticeOf = (kind: BountyKind): string | null => {
    if (left === null) return null;
    if (left[kind] <= 0) return CLEARED_NOTICE[kind];
    const held = holding[kind];
    if (!held) return null;
    if (!shown.has(held.id)) return elsewhereNotice(kind, held);
    return kind === 'general' ? ONE_AT_A_TIME_NOTICE : null;
  };
  const progressOf = (questId: string): number =>
    snapshot?.progress.find(row => row.questId === questId)?.progress ?? 0;
  const isAccepted = (questId: string): boolean =>
    snapshot?.progress.some(row => row.questId === questId) ?? false;
  const basicConds = licenseConditions(game, zone, 'basic');
  const namedConds = licenseConditions(game, zone, 'named');
  const namedQuest = offers.named;
  const ticketIssuedAt = namedQuest
    ? snapshot?.tickets.find(ticket => ticket.questId === namedQuest.id)?.issuedAt ?? null
    : null;
  const ticketMins = ticketIssuedAt === null || nowMs === 0 ? null
    : Math.max(0, Math.ceil(ticketRemainingMs(ticketIssuedAt, nowMs) / 60_000));
  const relic = artifactOfZone(zone);

  return {
    zone,
    leftAll,
    leftNamed,
    dailyCap: BOUNTY_DAILY_CAP,
    namedDailyCap: BOUNTY_NAMED_DAILY_CAP,
    offers,
    progressOf,
    isAccepted,
    basicConds,
    namedConds,
    basicOpen: basicConds.every(condition => condition.ok),
    namedOpen: namedConds.every(condition => condition.ok),
    canTake: snapshot !== null && (leftAll ?? 0) > 0 && !holding.general,
    canTakeNamed: snapshot !== null && (leftNamed ?? 0) > 0 && !holding.named,
    notice: { general: noticeOf('general'), named: noticeOf('named') },
    ticketMins,
    hasTicket: ticketMins !== null && ticketMins > 0,
    relic,
    relicOwned: relic ? game.artifacts.includes(relic.id) : false,
    relicMats: relic ? game.items[relic.materialId] ?? 0 : 0,
  };
}

export interface NamedBountyCardData {
  name: string | undefined;
  poster: string;
  fish: ReturnType<typeof namedFishOf> | null;
  found: boolean;
  done: boolean;
}

/** 네임드 카드의 공개 이름·스프라이트·완료 여부를 계산한다. */
export function selectNamedBountyCardData(
  game: GameState, quest: BountyQuest, progress: number,
): NamedBountyCardData {
  const named = quest.targetFish ? namedById(quest.targetFish) : undefined;
  return {
    name: named?.name,
    poster: named?.poster ?? '수배서에만 이름이 돈다.',
    fish: named ? namedFishOf(named) : null,
    found: quest.targetFish ? formDiscovered(game, quest.targetFish, 'normal') : false,
    done: progress >= quest.count,
  };
}
