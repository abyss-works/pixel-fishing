// 개발 도구 패널 노출 조건. 실제 개발 명령과 관리자 데이터 접근 권한은 서버가 판정한다.

/** 로컬 개발 오리진 여부 — 개발 도구 패널의 노출 조건 중 하나 */
export const isLocalOrigin = (): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

/** 개발 도구 패널 노출 — 로컬 오리진이거나 서버가 내려 준 사용 판정이 참일 때만 열린다. 명령 허용은 서버가 따로 판정한다 */
export const canSeeDevTools = (
  granted: boolean | undefined,
  where: { localOrigin: boolean } = { localOrigin: isLocalOrigin() },
): boolean => where.localOrigin || granted === true;
