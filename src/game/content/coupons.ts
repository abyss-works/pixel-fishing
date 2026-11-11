// 정적 쿠폰 데이터 — 사용 판정은 서버의 액션 리듀서가 한다. 동적 쿠폰은 DB의 coupons 표에 둔다.
// 코드는 관리자 대시보드(/admin/)에서 확인해 공유한다.
export const COUPONS: Record<string, { gold: number; desc: string }> = {
  '출항준비': { gold: 300, desc: '조각배 한 척 값의 출항 지원금' },
};
