import {
  flashTitle, getAlertEnabled, isPageHidden, notificationPermission, showNotification,
} from '../../../platform/api/attention';
import type { NotificationPermissionState } from '../../../platform/api/attention';
import { ALERT_COPY, planAlert } from '../../alerts/model/alerts';
import { useAlertSettings } from '../../alerts/service/alertSettings';
import type { AlertToggle } from '../../alerts/service/alertSettings';
import { encounterAlertText } from '../model/encounterAlert';

/** 조우 직후 부른다 — 다른 화면을 보고 있는 플레이어에게만 알린다 */
export function alertEncounter(questId: string): void {
  const text = encounterAlertText(questId);
  if (!text) return;
  const plan = planAlert({
    pageHidden: isPageHidden(),
    enabled: getAlertEnabled('encounter'),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle(ALERT_COPY.encounter.flash);
  if (plan.notify) showNotification({ ...text, tag: `pf-encounter-${questId}` });
}

export interface EncounterAlertSetting extends AlertToggle {
  permission: NotificationPermissionState;
}

/** 네임드 조우 알림 설정 — 수배판의 체크가 쓴다. 다른 알림은 바꾸지 않는다 */
export function useEncounterAlertSetting(): EncounterAlertSetting {
  const { permission, encounter } = useAlertSettings();
  return { permission, ...encounter };
}
