import { artifactOfZone } from '../../../game/content/artifacts';
import {
  dailyQuestFor, zoneOfPort,
} from '../../../game/content/bounties';
import type { BountyDifficulty, BountyPort, BountyQuest } from '../../../game/content/bounties';
import { namedById, namedFishOf } from '../../../game/content/named';
import { zoneById } from '../../../game/content/zones';
import { challengeWindowMs, ticketRemainingMs } from '../../../game/rules/challenge';
import { BOUNTY_DAILY_CAP, BOUNTY_NAMED_DAILY_CAP } from '../../../game/rules/balance';
import { formDiscovered, licenseConditions } from '../../../game/rules/logic';
import type { GameState, LicenseCondition } from '../../../game/rules/logic';
import { rodAxes } from '../../../game/rules/stats';
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
  leftAll: number | null;
  leftNamed: number | null;
  dailyCap: number;
  namedDailyCap: number;
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
  ticketMins: number | null;
  hasTicket: boolean;
  relic: ReturnType<typeof artifactOfZone>;
  relicOwned: boolean;
  relicMats: number;
  challengeSweepMs: number;
}

/** 오늘 의뢰판의 데이터·조건·진행 상태를 모은다. */
export function selectBountyPanelData({
  game, port, uid, day, nowMs, snapshot,
}: BountyPanelInput): BountyPanelData {
  const zone = zoneOfPort(port)!;
  const who = uid ?? 'local';
  const difficulties: BountyDifficulty[] = ['easy', 'normal', 'hard', 'named'];
  const offers = Object.fromEntries(difficulties.map(difficulty => [
    difficulty, dailyQuestFor(zone, difficulty, who, day),
  ])) as Record<BountyDifficulty, BountyQuest | undefined>;
  const leftAll = snapshot ? BOUNTY_DAILY_CAP - snapshot.acceptsToday : null;
  const leftNamed = snapshot ? BOUNTY_NAMED_DAILY_CAP - snapshot.namedToday : null;
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
    : Math.max(0, Math.ceil(ticketRemainingMs(
      ticketIssuedAt, nowMs, challengeWindowMs(),
    ) / 60_000));
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
    canTake: snapshot !== null && (leftAll ?? 0) > 0,
    canTakeNamed: snapshot !== null && (leftNamed ?? 0) > 0,
    ticketMins,
    hasTicket: ticketMins !== null && ticketMins > 0,
    relic,
    relicOwned: relic ? game.artifacts.includes(relic.id) : false,
    relicMats: relic ? game.items[relic.materialId] ?? 0 : 0,
    challengeSweepMs: rodAxes(game).sweep.value * 1000,
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
