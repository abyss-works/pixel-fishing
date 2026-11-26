import { useCallback, useSyncExternalStore } from 'react';
import {
  getAlertEnabled, notificationPermission, requestNotificationPermission, setAlertEnabled, subscribeAlert, subscribePermission,
} from '../../../platform/api/attention';
import type { AlertKind, NotificationPermissionState } from '../../../platform/api/attention';
import { ALERT_ORDER } from '../model/alerts';

export interface AlertToggle {
  /** 저장된 선택 — 권한과 무관하게 플레이어가 켜 둔 상태 */
  on: boolean;
  /** 켜 두었고 브라우저가 허용한 상태 — 실제로 알림이 뜬다 */
  active: boolean;
  /** 켜기 — 클릭 처리 안에서 불러야 브라우저가 권한을 묻는다. 허용됐는지 돌려준다 */
  enable: () => Promise<boolean>;
  disable: () => void;
}

export type AlertSettings = Record<AlertKind, AlertToggle> & {
  /** 브라우저 알림 권한 — 세 알림이 함께 쓴다. 게임 화면으로 돌아올 때 다시 읽는다 */
  permission: NotificationPermissionState;
  /** 권한을 요청하고, 허용되면 세 알림을 모두 켠다 — 클릭 처리 안에서 부른다. 요청 뒤의 권한 상태를 돌려준다 */
  allowAll: () => Promise<NotificationPermissionState>;
};

/** 허용돼 있으면 그대로, 아니면 묻는다. 묻는 호출은 첫 await 앞에서 일어나 클릭 동작 안에 남는다 */
async function ensurePermission(): Promise<NotificationPermissionState> {
  const current = notificationPermission();
  return current === 'granted' ? current : requestNotificationPermission();
}

function useAlertOn(kind: AlertKind): boolean {
  const subscribe = useCallback((listener: () => void) => subscribeAlert(kind, listener), [kind]);
  return useSyncExternalStore(subscribe, () => getAlertEnabled(kind));
}

/** 알림 설정 — 세 알림을 따로 켜고 끈다. 권한은 하나를 공유한다 */
export function useAlertSettings(): AlertSettings {
  const permission = useSyncExternalStore(subscribePermission, notificationPermission);
  const ons: Record<AlertKind, boolean> = { encounter: useAlertOn('encounter'), bag: useAlertOn('bag'), update: useAlertOn('update') };

  const toggle = (kind: AlertKind): AlertToggle => ({
    on: ons[kind],
    active: ons[kind] && permission === 'granted',
    enable: async () => {
      const next = await ensurePermission();
      setAlertEnabled(kind, next === 'granted');
      return next === 'granted';
    },
    disable: () => setAlertEnabled(kind, false),
  });

  return {
    permission,
    encounter: toggle('encounter'),
    bag: toggle('bag'),
    update: toggle('update'),
    allowAll: async () => {
      const next = await ensurePermission();
      if (next === 'granted') for (const kind of ALERT_ORDER) setAlertEnabled(kind, true);
      return next;
    },
  };
}
