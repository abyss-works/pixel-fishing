// 관리자 UI 노출 조건. 실제 관리자 데이터 접근과 상태 변경 권한은 서버가 판정한다.

/** 관리자 화면 URL 여부 */
export const isAdminUrl = (): boolean =>
  new URLSearchParams(window.location.search).has('admin');

/** 로컬 개발 오리진 여부 — 관리자 기능의 접근 조건 중 하나(?admin과 함께 봄) */
export const isLocalOrigin = (): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

/** 서버 권한이 아닌 관리자 UI 노출을 위한 운영자 계정 표시값 */
export const OWNER_EMAIL = 'inley@naver.com';
