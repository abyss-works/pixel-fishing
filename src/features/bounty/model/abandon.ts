import { bountyById, bountyKindOf } from '../../../game/content/bounties';
import type { BountyQuest } from '../../../game/content/bounties';
import type { GameState } from '../../../game/rules/logic';
import { canAbandonQuest } from '../../../game/rules/rules';
import type { BountyCtx } from '../../../game/rules/rules';
import type { BountySnapshot } from './types';

/** 수배 스냅샷을 규칙 판정용 BountyCtx로 변환한다 */
export function bountyCtxOf(snapshot: BountySnapshot | null): BountyCtx | undefined {
  if (!snapshot) return undefined;
  const active: string[] = [];
  const complete: string[] = [];
  for (const row of snapshot.progress) {
    active.push(row.questId);
    const quest = bountyById(row.questId);
    if (quest && row.progress >= quest.count) complete.push(row.questId);
  }
  return {
    clearsToday: snapshot.clearsToday,
    tickets: snapshot.tickets,
    active,
    complete,
  };
}

/** 스냅샷 기준 미완료 의뢰 포기 가능 여부 — 위치와 무관하게 규칙 판정 결과를 따른다 */
export function canAbandonQuestInSnapshot(
  game: GameState, questId: string, snapshot: BountySnapshot | null,
): boolean {
  return canAbandonQuest(game, questId, bountyCtxOf(snapshot)).ok;
}

export interface AbandonConfirmSpec {
  title: string;
  body: string;
  confirmLabel: string;
}

/** 의뢰 포기 확인 창 문구 — 일반 의뢰와 네임드 토벌(남아 있는 흔적 유무)로 나눈다 */
export function abandonConfirmSpec(
  quest: Pick<BountyQuest, 'difficulty'>, hasTicket: boolean,
): AbandonConfirmSpec {
  const kind = bountyKindOf(quest);
  const body = kind === 'general'
    ? '지금 진행 중인 의뢰를 포기할까요?\n지금까지 쌓은 진행도는 사라지며 되돌릴 수 없어요.'
    : hasTicket
      ? '진행 중인 네임드 토벌을 포기하면 남아 있는 흔적이 함께 사라져요.\n이미 입힌 네임드의 상처는 그대로 유지돼요.'
      : '진행 중인 네임드 토벌을 포기할까요?\n이미 입힌 네임드의 상처는 그대로 남아요.';
  return {
    title: '의뢰 포기',
    body,
    confirmLabel: '포기',
  };
}
