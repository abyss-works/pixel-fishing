import { bountyById } from '../../../game/content/bounties';
import { zoneById } from '../../../game/content/zones';
import { TICKET_EXPIRY_TEXT } from '../../../game/rules/challenge';

export interface EncounterAlertText { title: string; body: string }

/** 조우 알림 문구 — 네임드 이름은 승부에서 이긴 뒤에 공개되므로 구역과 남는 시간만 알린다 */
export function encounterAlertText(questId: string): EncounterAlertText | null {
  const quest = bountyById(questId);
  if (!quest || quest.difficulty !== 'named') return null;
  const zone = zoneById(quest.zone)?.shortName ?? quest.zone;
  return {
    title: '흔적 발견',
    body: `${zone}의 수면 아래로 무언가 지나갔어요. 흔적은 ${TICKET_EXPIRY_TEXT} 남아요.`,
  };
}
