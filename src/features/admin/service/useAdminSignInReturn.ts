import { useQuery } from '@tanstack/react-query';
import { adminSignInNotice } from '../model/googleSignIn';
import type { AdminSignInNotice } from '../model/googleSignIn';
import { adminKeys } from './queryKeys';
import { adminSignInRequired, takeAdminSignInReturn } from './queries';

// 구글 로그인에서 돌아온 결과의 안내. 돌아온 주소는 읽는 즉시 지워지므로 읽기를 캐시에 한 번만 담아
// 가드가 다시 그려지거나 개발 모드에서 효과가 다시 돌아도 같은 결과를 쓴다.
export function useAdminSignInReturn(): AdminSignInNotice | null {
  const q = useQuery({
    queryKey: adminKeys.signInReturn,
    queryFn: () => ({ notice: adminSignInNotice(takeAdminSignInReturn()?.error ?? null) }),
    enabled: adminSignInRequired,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return q.data?.notice ?? null;
}
