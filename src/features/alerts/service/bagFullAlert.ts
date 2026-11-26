import { useEffect, useRef } from 'react';
import {
  flashTitle, getAlertEnabled, isPageHidden, notificationPermission, showNotification,
} from '../../../platform/api/attention';
import { ALERT_COPY, BAG_FULL_NOTIFICATION, planAlert, shouldAlertBagFull } from '../model/alerts';

/** 가방이 가득 찼음을 다른 화면을 보는 플레이어에게 알린다 */
export function alertBagFull(): void {
  const plan = planAlert({
    pageHidden: isPageHidden(),
    enabled: getAlertEnabled('bag'),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle(ALERT_COPY.bag.flash);
  if (plan.notify) showNotification({ ...BAG_FULL_NOTIFICATION, tag: 'pf-bag-full' });
}

/** 가방이 가득 차는 순간을 지켜본다 — 자리를 비운 동안 한 번 알리고, 게임 화면으로 돌아오면 다시 알릴 수 있다 */
export function useBagFullAlert(full: boolean): void {
  const wasFull = useRef(full);
  const alerted = useRef(false);

  useEffect(() => {
    const onReturn = () => { if (!document.hidden) alerted.current = false; };
    document.addEventListener('visibilitychange', onReturn);
    return () => document.removeEventListener('visibilitychange', onReturn);
  }, []);

  useEffect(() => {
    const due = shouldAlertBagFull({ wasFull: wasFull.current, full, pageHidden: isPageHidden(), alreadyAlerted: alerted.current });
    wasFull.current = full;
    if (!due) return;
    alerted.current = true;
    alertBagFull();
  }, [full]);
}
