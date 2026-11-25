// 정적 쿠폰 데이터 — 사용 판정은 액션 리듀서가 한다. 서버가 실행하고, 오프라인 모드에서는 클라이언트의
// LocalGameGateway가 같은 리듀서를 실행한다. 동적 쿠폰은 DB의 coupons 표에 둔다.
// 코드는 관리자 대시보드(/admin/)에서 확인해 공유한다.
export interface CouponItem {
  id: string;
  qty: number;
}

export interface Coupon {
  gold: number;
  items?: readonly CouponItem[];
  desc: string;
}

export const COUPONS: Record<string, Coupon> = {
  '출항준비': { gold: 300, items: [{ id: 'luck-small', qty: 1 }], desc: '출항 지원금과 작은 행운 물약' },
};
