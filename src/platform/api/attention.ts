// 주의 끌기(시스템 알림·탭 제목 깜빡임)와 알림 선호 저장소를 기능 계층에 공개하는 API 경계.
export {
  flashTitle,
  getAlertEnabled,
  isAlertPromptSeen,
  isPageHidden,
  markAlertPromptSeen,
  notificationPermission,
  requestNotificationPermission,
  resetAlerts,
  setAlertEnabled,
  showNotification,
  subscribeAlert,
  subscribePermission,
} from '../adapters/attention';
export type { AlertKind, NotificationPermissionState } from '../adapters/attention';
