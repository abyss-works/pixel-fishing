import { useState, useSyncExternalStore } from 'react';
import {
  flashTitle, getEncounterAlertEnabled, isPageHidden, notificationPermission, requestNotificationPermission,
  resetEncounterAlert, setEncounterAlertEnabled, showNotification, subscribeEncounterAlert,
} from '../../../platform/api/attention';
import type { NotificationPermissionState } from '../../../platform/api/attention';
import { challengeWindowMs } from '../../../game/rules/challenge';
import { encounterAlertText, shouldAlertEncounter } from '../model/encounterAlert';

export { resetEncounterAlert };

const FLASH_TEXT = '흔적 발견!';

/** 조우 직후 부른다 — 다른 화면을 보고 있는 플레이어에게만 알린다 */
export function alertEncounter(questId: string): void {
  const text = encounterAlertText(questId, challengeWindowMs());
  if (!text) return;
  const plan = shouldAlertEncounter({
    pageHidden: isPageHidden(),
    enabled: getEncounterAlertEnabled(),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle(FLASH_TEXT);
  if (plan.notify) showNotification({ ...text, tag: `pf-encounter-${questId}` });
}

export interface EncounterAlertSetting {
  /** 플레이어가 켜 두었고 브라우저가 허용한 상태 — 실제로 알림이 뜬다 */
  active: boolean;
  permission: NotificationPermissionState;
  /** 켜기 — 클릭 처리 안에서 불러야 브라우저가 권한을 묻는다. 허용됐는지 돌려준다 */
  enable: () => Promise<boolean>;
  disable: () => void;
}

/** 조우 알림 설정 — 설정 탭과 수배판이 같은 값을 본다 */
export function useEncounterAlertSetting(): EncounterAlertSetting {
  const enabled = useSyncExternalStore(subscribeEncounterAlert, getEncounterAlertEnabled, getEncounterAlertEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission);
  return {
    active: enabled && permission === 'granted',
    permission,
    enable: async () => {
      const next = permission === 'granted' ? permission : await requestNotificationPermission();
      setPermission(next);
      setEncounterAlertEnabled(next === 'granted');
      return next === 'granted';
    },
    disable: () => setEncounterAlertEnabled(false),
  };
}
