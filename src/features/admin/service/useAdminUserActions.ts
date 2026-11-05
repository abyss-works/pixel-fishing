import { useQueryClient } from '@tanstack/react-query';
import { writeAdminResetLink, writeAdminRestrict } from './queries';

/**
 * 사용자 상세의 관리자 조치 — 제재·해제와 비밀번호 재설정 링크 발급.
 * 조치는 명부(restricted)와 사용자 이벤트를 바꾸므로, 접근 판정을 뺀 관리자 조회를 모두 다시 읽게 표시한다.
 * 화면에 떠 있는 조회만 바로 다시 읽고 나머지는 다음에 열 때 읽는다.
 */
export function useAdminUserActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['admin'], predicate: q => q.queryKey[1] !== 'access' });
  return {
    restrict: async (userId: string, restricted: boolean) => {
      const result = await writeAdminRestrict(userId, restricted);
      await refresh();
      return result;
    },
    resetLink: async (userId: string) => {
      const link = await writeAdminResetLink(userId);
      await refresh();
      return link;
    },
  };
}
