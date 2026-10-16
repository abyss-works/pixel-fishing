import { bountyById } from '../../../game/content/bounties';
import { zoneById } from '../../../game/content/zones';
import type { NotificationPermissionState } from '../../../platform/api/attention';

export interface EncounterAlertText { title: string; body: string }

/** 조우 알림 문구 — 네임드 이름은 승부에서 이긴 뒤에 공개되므로 구역과 남는 시간만 알린다 */
export function encounterAlertText(questId: string, windowMs: number): EncounterAlertText | null {
  const quest = bountyById(questId);
  if (!quest || quest.difficulty !== 'named') return null;
  const zone = zoneById(quest.zone)?.shortName ?? quest.zone;
  const hours = Math.round(windowMs / 3_600_000);
  return {
    title: '흔적을 찾았다',
    body: `${zone}의 수면 아래로 무언가 지나갔다. 흔적은 ${hours}시간 동안 남는다.`,
  };
}

/** 조우를 어떻게 알릴지 — 화면을 보고 있으면 토스트와 흔적 카드로 충분하다.
 *  다른 화면을 보고 있으면 탭 제목을 깜빡이고, 알림을 켜고 허용했을 때만 시스템 알림을 더한다. */
export function shouldAlertEncounter({ pageHidden, enabled, permission }: {
  pageHidden: boolean; enabled: boolean; permission: NotificationPermissionState;
}): { flash: boolean; notify: boolean } {
  if (!pageHidden) return { flash: false, notify: false };
  return { flash: true, notify: enabled && permission === 'granted' };
}
