// 관리자 UI 노출 조건. 실제 관리자 데이터 접근과 상태 변경 권한은 서버가 판정한다.

/** 관리자 화면 URL 여부 */
export const isAdminUrl = (): boolean =>
  new URLSearchParams(window.location.search).has('admin');

/** 옛 관리자 주소(?admin=1#/admin/...)의 이동 대상 — 해시 경로를 유지한 /admin/ 주소. 옛 주소가 아니면 null */
export const legacyAdminTarget = (search: string, hash: string): string | null =>
  new URLSearchParams(search).has('admin') && hash.startsWith('#/admin') ? `/admin/${hash}` : null;

/** 로컬 개발 오리진 여부 — 관리자 기능의 접근 조건 중 하나(?admin과 함께 봄) */
export const isLocalOrigin = (): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

/** 서버 권한이 아닌 관리자 UI 노출을 위한 운영자 계정 표시값 */
export const OWNER_EMAIL = 'inley@naver.com';

/** 개발 도구 패널 노출 — ?admin + (로컬 오리진 또는 소유자 계정). 명령 허용은 서버가 따로 판정한다 */
export const canSeeDevTools = (account: string | null): boolean =>
  isAdminUrl() && (isLocalOrigin() || (account ?? '').toLowerCase() === OWNER_EMAIL);
