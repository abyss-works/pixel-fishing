import { artifactOfZone } from '../../../game/content/artifacts';
import { BOUNTY_PORT_ZONE, portOfZone } from '../../../game/content/bounties';
import type { BountyKind, BountyPort, BountyQuest, BountyZone } from '../../../game/content/bounties';
import type { RarityId } from '../../../game/content/rarity';
import type { GameState } from '../../../game/rules/logic';
import { BASE_PACKS } from '../../../game/world';
import { clearsStatus, heldQuests, questLabel, selectNamedBountyCardData } from './panel';
import { ticketMinsOf } from './ticket';
import type { BountySnapshot } from './types';

// 현재 의뢰 정보 - 메뉴 줄의 의뢰를 눌러 여는 창이 보이는 값. 수주 중인 의뢰(갈래마다 하나)의 이름, 목표, 진행도,
// 보상, 교환 재료, 흔적 남은 시간, 마치는 곳을 모은다. 규칙(남은 시간, 한도)은 규칙 함수가 정한 값을 그대로 쓴다.

export interface QuestInfoGeneral {
  quest: BountyQuest;
  title: string;
  grade: RarityId;
  count: number;
  /** 목표를 넘겨 보이지 않는다 */
  progress: number;
  reward: number;
  /** 의뢰를 마치러 갈 곳 - 의뢰 구역의 항구 수배판 */
  finishAt: string;
}

export interface QuestInfoNamed {
  quest: BountyQuest;
  /** 발견하기 전에는 ??? */
  title: string;
  /** 나타나는 곳 */
  haunt: string;
  count: number;
  progress: number;
  /** 토벌을 마쳤고 보상만 남았다 */
  done: boolean;
  reward: number;
  /** 구역 유물의 교환 재료 이름 */
  materialName: string | null;
  /** 흔적이 남아 있으면 남은 분, 아니면 null. 토벌을 마친 뒤에도 null */
  traceMins: number | null;
  finishAt: string;
}

export interface QuestInfoData {
  /** 오늘 남은 클리어 횟수. 스냅샷이 없으면 null */
  left: { general: number; named: number } | null;
  caps: Record<BountyKind, number>;
  general: QuestInfoGeneral | null;
  named: QuestInfoNamed | null;
  /** 수배판이 있는 항구 이름 - 받은 의뢰가 없을 때 어디서 받는지 안내한다 */
  boardPorts: string[];
}

const PORTS = Object.keys(BOUNTY_PORT_ZONE) as BountyPort[];
const portName = (port: BountyPort): string => BASE_PACKS[port].name;
// 수배판이 없는 구역이면 항구 이름 없이 "수배판"만 보인다
const finishAtOf = (zone: BountyZone): string => {
  const port = portOfZone(zone);
  return port ? `${portName(port)} 수배판` : '수배판';
};

export function selectQuestInfo({ game, snapshot, nowMs }: {
  game: GameState; snapshot: BountySnapshot | null; nowMs: number;
}): QuestInfoData {
  const held = heldQuests(snapshot);
  const progressOf = (quest: BountyQuest): number => {
    const progress = snapshot?.progress.find(row => row.questId === quest.id)?.progress ?? 0;
    return Math.min(progress, quest.count);
  };

  const g = held.general;
  const general: QuestInfoGeneral | null = g && g.grade ? {
    quest: g, title: questLabel(g), grade: g.grade, count: g.count, progress: progressOf(g),
    reward: g.reward, finishAt: finishAtOf(g.zone),
  } : null;

  const n = held.named;
  let named: QuestInfoNamed | null = null;
  if (n) {
    const progress = progressOf(n);
    const card = selectNamedBountyCardData(game, n, progress);
    named = {
      quest: n,
      title: card.found && card.name ? card.name : '???',
      haunt: card.haunt,
      count: n.count,
      progress,
      done: card.done,
      reward: n.reward,
      materialName: artifactOfZone(n.zone)?.materialName ?? null,
      traceMins: card.done ? null : ticketMinsOf(snapshot, n.id, nowMs),
      finishAt: finishAtOf(n.zone),
    };
  }

  return {
    ...clearsStatus(snapshot),
    general,
    named,
    boardPorts: PORTS.map(portName),
  };
}
