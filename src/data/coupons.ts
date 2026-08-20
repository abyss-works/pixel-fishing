// 쿠폰 데이터 — 친구 규모라 클라이언트 검증으로 충분. P1 서버 도입 시 서버 검증으로 이관.
// 코드는 관리자 대시보드(?admin)에서 확인해 공유한다.
export const COUPONS: Record<string, { gold: number; desc: string }> = {
  '출항준비': { gold: 300, desc: '레벨디자인 개편 보상 — 조각배 값' },
};
