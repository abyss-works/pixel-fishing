import { useQueryClient } from '@tanstack/react-query';
import type { AdminCouponRequest } from '../../../platform/api';
import { writeAdminCoupon } from './queries';
import { adminKeys } from './queryKeys';

/** 동적 쿠폰 생성·수정·삭제. 변경 후 쿠폰 목록을 다시 읽는다 */
export function useAdminCoupons() {
  const client = useQueryClient();
  return async (request: AdminCouponRequest) => {
    const result = await writeAdminCoupon(request);
    await client.invalidateQueries({ queryKey: adminKeys.coupons });
    return result;
  };
}
