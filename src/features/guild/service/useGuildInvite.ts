import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readGuildInvite, takeGuildInviteLanding } from '../../../platform/api';

/**
 * 초대 링크로 열린 첫 화면의 길드 코드. 부팅 때 주소에서 한 번 꺼낸다(주소는 첫 화면으로 되돌린다).
 * clear로 초대를 마친다. 게스트가 계정을 만들 때까지는 지우지 않고 들고 있는다.
 */
export function useGuildInviteLanding(): { code: string | null; clear: () => void } {
  const [code, setCode] = useState<string | null>(() => takeGuildInviteLanding());
  const clear = useCallback(() => setCode(null), []);
  return { code, clear };
}

/** 초대 링크 미리보기 — 로그인 없이 읽는다. 없는 코드면 preview가 null이고 settled가 참이다 */
export function useGuildInvite(code: string | null) {
  const q = useQuery({
    queryKey: ['guildInvite', code],
    queryFn: () => readGuildInvite(code as string),
    enabled: code !== null,
    staleTime: 30_000,
    retry: 1,
  });
  return { preview: q.data ?? null, settled: q.isSuccess, failed: q.isError, refresh: q.refetch };
}
