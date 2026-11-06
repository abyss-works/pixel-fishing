// 주의 끌기(시스템 알림·탭 제목 깜빡임)와 알림 선호 저장소를 기능 계층에 공개하는 API 경계.
export {
  flashTitle,
  getEncounterAlertEnabled,
  getUpdateAlertEnabled,
  isPageHidden,
  notificationPermission,
  requestNotificationPermission,
  resetEncounterAlert,
  resetUpdateAlert,
  setEncounterAlertEnabled,
  setUpdateAlertEnabled,
  showNotification,
  subscribeEncounterAlert,
  subscribeUpdateAlert,
} from '../adapters/attention';
export type { NotificationPermissionState } from '../adapters/attention';
