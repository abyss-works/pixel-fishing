import { useQueryClient } from '@tanstack/react-query';
import type { AuthResult } from '../../../platform/api';
import { adminKeys } from './queryKeys';
import { signInAdmin, signOutAdmin } from './queries';

// 관리자 로그인·로그아웃. 성공하면 접근 판정을 다시 읽어 가드가 다음 화면으로 넘어간다.
// 로그아웃은 판정을 처음 상태로 되돌려 대시보드를 내리고, 관리자 읽기 캐시를 비워 다음 계정이 이전 데이터를 보지 않게 한다.
export function useAdminSession(): {
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
} {
  const client = useQueryClient();
  return {
    async signIn(email, password) {
      const result = await signInAdmin(email, password);
      if (result.ok) await client.invalidateQueries({ queryKey: adminKeys.access });
      return result;
    },
    async signOut() {
      await signOutAdmin();
      await client.resetQueries({ queryKey: adminKeys.access });
      client.removeQueries({ queryKey: ['admin'], predicate: q => q.queryKey[1] !== 'access' });
    },
  };
}
