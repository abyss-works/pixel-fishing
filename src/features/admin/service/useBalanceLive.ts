import { useAdminAuth } from './accessContext';
import { readAdminBalanceLive } from './queries';
import { adminKeys } from './queryKeys';
import { useAdminQuery } from './useAdminQuery';
import type { AdminQuery } from './useAdminQuery';
import type { BalanceLive } from '../model/types';

/** 이벤트를 보관하는 기간(일). 밸런스 라이브 지표 기간의 기본값이자 상한이다 */
export const BALANCE_LIVE_DAYS = 7;

// 밸런스 라이브 지표 조회. 관리자 판정이 granted일 때만 서버에 읽는다.
// 기간은 캐시 키에 들어가 기간마다 따로 캐시하고, 반환형은 다른 관리자 조회와 같다.
export function useBalanceLive(days: number = BALANCE_LIVE_DAYS): AdminQuery<BalanceLive> {
  const { access } = useAdminAuth();
  return useAdminQuery(adminKeys.balanceLive(days), () => readAdminBalanceLive(days), access === 'granted');
}
