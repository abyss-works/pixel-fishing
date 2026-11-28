import { bountyById } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import { namedById } from '../../../game/content/named';
import type { NamedFish } from '../../../game/content/named';
import { topZoneOf, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { ticketMinsLeft } from './ticket';
import type { BountySnapshot } from './types';

/** 바다 위 흔적 카드 한 장 — 유효한 도전권(흔적). 토벌을 마친 보상 대기는 받을 보상 카드가 보인다 */
export interface TraceCardData {
  quest: BountyQuest;
  named: NamedFish;
  /** 의뢰 구역의 짧은 이름 — 구역 밖에서 "흔적이 {구역}에 남아 있다"에 쓴다 */
  zoneName: string;
  /** 지금 서 있는 최상위 구역이 의뢰 구역인가 — 같을 때만 추적할 수 있다 */
  here: boolean;
  /** 남은 분(올림) */
  leftMins: number;
}

function cardOf(quest: BountyQuest, zone: ZoneId | null, leftMins: number): TraceCardData | null {
  const named = quest.targetFish ? namedById(quest.targetFish) : undefined;
  if (!named) return null;
  return {
    quest, named,
    zoneName: zoneById(quest.zone)?.shortName ?? quest.zone,
    here: zone !== null && topZoneOf(zone) === quest.zone,
    leftMins,
  };
}

/** 흔적 카드를 고른다 — 남은 시간이 있는 도전권. 없으면 null.
 *  nowMs가 0이면(시계를 아직 안 찍음) 도전권 카드는 만들지 않는다. */
export function selectTraceCard(
  snapshot: BountySnapshot | null, zone: ZoneId | null, nowMs: number,
): TraceCardData | null {
  if (!snapshot) return null;
  for (const ticket of snapshot.tickets) {
    const quest = bountyById(ticket.questId);
    if (!quest) continue;
    const leftMins = ticketMinsLeft(ticket.issuedAt, nowMs);
    if (leftMins === null) continue;
    const card = cardOf(quest, zone, leftMins);
    if (card) return card;
  }
  return null;
}

/** 방치 결과 카드의 흔적 줄 — 거점(항구, 집)에서 유효한 흔적이 있을 때만 남은 분을 준다. 바다는 흔적 카드가 같은 정보를 보인다 */
export function selectAwayTraceLine(
  snapshot: BountySnapshot | null, atSea: boolean, nowMs: number,
): { leftMins: number } | null {
  if (atSea) return null;
  const card = selectTraceCard(snapshot, null, nowMs);
  return card ? { leftMins: card.leftMins } : null;
}
