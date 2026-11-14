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

/** 개발 도구 패널 노출 — ?admin + (로컬 오리진 또는 서버가 내려 준 사용 판정). 판정이 없거나 거짓이면 닫힌다. 명령 허용은 서버가 따로 판정한다 */
export const canSeeDevTools = (
  granted: boolean | undefined,
  where: { adminUrl: boolean; localOrigin: boolean } = { adminUrl: isAdminUrl(), localOrigin: isLocalOrigin() },
): boolean => where.adminUrl && (where.localOrigin || granted === true);
