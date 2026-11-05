import {
  flashTitle, getEncounterAlertEnabled, isPageHidden, notificationPermission, showNotification,
} from '../../../platform/api/attention';
import { shouldAlertEncounter } from '../../bounty/model/encounterAlert';

// 업데이트 알림 — 방치 중 새 버전이 나와 진행이 멈췄음을 다른 화면을 보는 플레이어에게 알린다.
// 네임드 조우 알림과 같은 규칙과 같은 설정(알림 켜기)을 쓴다.

/** 업데이트 안내 창이 처음 뜰 때 부른다 */
export function alertUpdate(): void {
  const plan = shouldAlertEncounter({
    pageHidden: isPageHidden(),
    enabled: getEncounterAlertEnabled(),
    permission: notificationPermission(),
  });
  if (plan.flash) flashTitle('업데이트');
  if (plan.notify) {
    showNotification({ title: '새 버전', body: '게임이 업데이트됐어요. 돌아와서 새로고침하면 이어서 플레이할 수 있어요.', tag: 'pf-update' });
  }
}
