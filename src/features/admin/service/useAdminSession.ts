import { useQueryClient } from '@tanstack/react-query';
import type { AuthResult } from '../../../platform/api';
import { adminKeys } from './queryKeys';
import { signInAdmin, signOutAdmin } from './queries';

// 관리자 로그인·로그아웃. 로그인은 구글 인증 화면으로 이동하므로 성공하면 페이지가 떠난다.
// 로그아웃은 판정을 처음 상태로 되돌려 대시보드를 내리고, 관리자 읽기 캐시를 비워 다음 계정이 이전 데이터를 보지 않게 한다.
export function useAdminSession(): {
  signIn(): Promise<AuthResult>;
  signOut(): Promise<void>;
} {
  const client = useQueryClient();
  return {
    signIn: signInAdmin,
    async signOut() {
      await signOutAdmin();
      await client.resetQueries({ queryKey: adminKeys.access });
      client.removeQueries({ queryKey: ['admin'], predicate: q => q.queryKey[1] !== 'access' });
    },
  };
}
