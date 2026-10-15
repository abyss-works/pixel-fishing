// 업데이트 소식 기록 저장소를 기능 계층에 공개하는 API 경계.
export {
  getAnnouncements,
  markPromptsAnswered,
  resetAnnouncements,
  setDismissedVersion,
  subscribeAnnouncements,
} from '../adapters/announcements';
export type { AnnouncementsState } from '../adapters/announcements';
