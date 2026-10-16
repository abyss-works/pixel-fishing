import { bountyById } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';
import type { NamedFish } from '../../../game/content/named';
import { topZoneOf, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { challengeWindowMs, ticketRemainingMs } from '../../../game/rules/challenge';
import type { BountySnapshot } from './types';

/** 바다 위 흔적 카드 한 장 — 유효한 도전권(흔적) 또는 토벌을 마치고 보상을 안 받은 네임드 의뢰 */
export interface TraceCardData {
  quest: BountyQuest;
  named: NamedFish;
  /** 의뢰 구역의 짧은 이름 — 구역 밖에서 "흔적이 {구역}에 남아 있다"에 쓴다 */
  zoneName: string;
  /** 지금 서 있는 최상위 구역이 의뢰 구역인가 — 같을 때만 추적할 수 있다 */
  here: boolean;
  /** 남은 분(올림). 토벌을 마친 카드는 0 */
  leftMins: number;
  /** 토벌을 마쳤는가 — 수배판에서 보상을 받으면 카드가 사라진다 */
  done: boolean;
}

function cardOf(quest: BountyQuest, zone: ZoneId | null, leftMins: number, done: boolean): TraceCardData | null {
  const named = quest.targetFish ? namedById(quest.targetFish) : undefined;
  if (!named) return null;
  return {
    quest, named,
    zoneName: zoneById(quest.zone)?.shortName ?? quest.zone,
    here: zone !== null && topZoneOf(zone) === quest.zone,
    leftMins, done,
  };
}

/** 흔적 카드를 고른다 — 토벌을 마친 의뢰가 먼저, 다음이 남은 시간이 있는 도전권. 없으면 null.
 *  nowMs가 0이면(시계를 아직 안 찍음) 도전권 카드는 만들지 않는다. */
export function selectTraceCard(
  snapshot: BountySnapshot | null, zone: ZoneId | null, nowMs: number,
): TraceCardData | null {
  if (!snapshot) return null;
  for (const row of snapshot.progress) {
    const quest = bountyById(row.questId);
    if (quest?.difficulty !== 'named' || row.progress < quest.count) continue;
    const card = cardOf(quest, zone, 0, true);
    if (card) return card;
  }
  if (nowMs === 0) return null;
  for (const ticket of snapshot.tickets) {
    const quest = bountyById(ticket.questId);
    if (!quest) continue;
    const leftMs = ticketRemainingMs(ticket.issuedAt, nowMs, challengeWindowMs());
    if (leftMs <= 0) continue;
    const card = cardOf(quest, zone, Math.ceil(leftMs / 60_000), false);
    if (card) return card;
  }
  return null;
}
