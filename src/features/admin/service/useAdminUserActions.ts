import { useQueryClient } from '@tanstack/react-query';
import { writeAdminRestrict, writeAdminRevokeSessions } from './queries';

/**
 * 사용자 상세·신고 구역의 관리자 조치 — 제재·해제, 세션 강제 종료.
 * 조치는 명부(restricted), 활성 세션, 사용자 이벤트를 바꾸므로 접근 판정을 뺀 관리자 조회를 무효화한다.
 * 화면에 떠 있는 조회만 바로 다시 읽고 나머지는 다음에 열 때 읽는다.
 */
export function useAdminUserActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({
    queryKey: ['admin'],
    // 로그인 복귀 값은 한 번 읽으면 사라지므로 다시 읽지 않는다
    predicate: q => q.queryKey[1] !== 'access' && q.queryKey[1] !== 'signInReturn',
  });
  return {
    restrict: async (userId: string, restricted: boolean) => {
      const result = await writeAdminRestrict(userId, restricted);
      await refresh();
      return result;
    },
    revokeSessions: async (userId: string) => {
      const result = await writeAdminRevokeSessions(userId);
      await refresh();
      return result;
    },
  };
}
