import { useState, useSyncExternalStore } from 'react';
import {
  flashTitle, getEncounterAlertEnabled, getUpdateAlertEnabled, isPageHidden, notificationPermission,
  requestNotificationPermission, resetEncounterAlert, resetUpdateAlert, setEncounterAlertEnabled,
  setUpdateAlertEnabled, showNotification, subscribeEncounterAlert, subscribeUpdateAlert,
} from '../../../platform/api/attention';
import type { NotificationPermissionState } from '../../../platform/api/attention';
import { encounterAlertText, shouldAlertEncounter } from '../model/encounterAlert';

export { resetEncounterAlert, resetUpdateAlert };

const FLASH_TEXT = '흔적 발견';

/** 조우 직후 부른다 — 다른 화면을 보고 있는 플레이어에게만 알린다 */
export function alertEncounter(questId: string): void {
  const text = encounterAlertText(questId);
  if (!text) return;
  const plan = shouldAlertEncounter({
    pageHidden: isPageHidden(),
    enabled: getEncounterAlertEnabled(),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle(FLASH_TEXT);
  if (plan.notify) showNotification({ ...text, tag: `pf-encounter-${questId}` });
}

export interface AlertToggle {
  /** 플레이어가 켜 두었고 브라우저가 허용한 상태 — 실제로 알림이 뜬다 */
  active: boolean;
  /** 켜기 — 클릭 처리 안에서 불러야 브라우저가 권한을 묻는다. 허용됐는지 돌려준다 */
  enable: () => Promise<boolean>;
  disable: () => void;
}

export interface AlertSettings {
  /** 브라우저 알림 권한 — 두 알림이 함께 쓴다 */
  permission: NotificationPermissionState;
  encounter: AlertToggle;
  update: AlertToggle;
}

/** 알림 설정 — 네임드 조우와 업데이트를 따로 켜고 끈다. 권한은 하나를 공유한다 */
export function useAlertSettings(): AlertSettings {
  const encounterOn = useSyncExternalStore(subscribeEncounterAlert, getEncounterAlertEnabled, getEncounterAlertEnabled);
  const updateOn = useSyncExternalStore(subscribeUpdateAlert, getUpdateAlertEnabled, getUpdateAlertEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>(notificationPermission);

  const toggle = (on: boolean, set: (next: boolean) => void): AlertToggle => ({
    active: on && permission === 'granted',
    enable: async () => {
      const next = permission === 'granted' ? permission : await requestNotificationPermission();
      setPermission(next);
      set(next === 'granted');
      return next === 'granted';
    },
    disable: () => set(false),
  });

  return {
    permission,
    encounter: toggle(encounterOn, setEncounterAlertEnabled),
    update: toggle(updateOn, setUpdateAlertEnabled),
  };
}

export interface EncounterAlertSetting extends AlertToggle {
  permission: NotificationPermissionState;
}

/** 네임드 조우 알림 설정 — 수배판의 체크가 쓴다. 업데이트 알림은 바꾸지 않는다 */
export function useEncounterAlertSetting(): EncounterAlertSetting {
  const { permission, encounter } = useAlertSettings();
  return { permission, ...encounter };
}
