// 사이드바 셸 전용 게이트 — 관리자 탭 노출 조건 (?admin + 로컬/소유자).
// 도감·가방 공용물은 각자 자리로 흩어졌다: RARITY_CARD→ui/RarityTag,
// rarityRank→data/rarity 직접, dexIndex→pages/bag/BagCards(유일 사용처),
// maskUid→pages/settings/maskUid, DexView→pages/dex/DexTab.

/** 관리자 게이트 — URL ?admin (관리 대시보드·이사 코드 등 운영 기능 공용).
 *  친구 규모라 URL 파라미터로 충분하다 — 서버 권한 검증이 필요해지면 그때 승격한다. */
export const isAdminUrl = (): boolean =>
  new URLSearchParams(window.location.search).has('admin');

/** 로컬 개발 오리진 여부 — 관리자 기능의 접근 조건 중 하나(?admin과 함께 봄) */
export const isLocalOrigin = (): boolean =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

/** 운영자 계정 이메일 — 관리자 UI 표시용 힌트. 진짜 경계는 서버(api/action.ts
 *  importOwnerEmail, env 정본)라 여기 값과 어긋나도 권한이 열리지 않는다. 소유자가
 *  바뀌면 양쪽을 함께 고친다. */
export const OWNER_EMAIL = 'inley@naver.com';
