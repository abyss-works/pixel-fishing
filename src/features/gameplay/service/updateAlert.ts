import {
  flashTitle, getAlertEnabled, isPageHidden, notificationPermission, showNotification,
} from '../../../platform/api/attention';
import { ALERT_COPY, planAlert } from '../../alerts/model/alerts';

// 업데이트 알림 — 방치 중 새 버전이 나와 진행이 멈췄음을 다른 화면을 보는 플레이어에게 알린다.
// 네임드 조우 알림과 같은 규칙을 쓰고, 켜고 끄는 설정은 업데이트 알림 전용 값을 읽는다.

/** 업데이트 안내 창이 처음 뜰 때 부른다 */
export function alertUpdate(): void {
  const plan = planAlert({
    pageHidden: isPageHidden(),
    enabled: getAlertEnabled('update'),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle(ALERT_COPY.update.flash);
  if (plan.notify) {
    showNotification({ title: '업데이트 안내', body: '게임이 업데이트됐어요. 돌아와서 새로고침하면 이어서 플레이할 수 있어요.', tag: 'pf-update' });
  }
}
