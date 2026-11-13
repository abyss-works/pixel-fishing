import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../platform/api';
import { loginMethodOf } from '../model/googleFlow';
import type { LoginMethod } from '../model/googleFlow';

/**
 * 지금 계정의 로그인 방식. 게스트는 바로 정해지고, 영구 계정은 붙은 로그인 수단을 읽는 동안 method가 null이다.
 * 읽지 못하면 method는 null로 남고 failed가 참이며, retry로 다시 읽는다.
 */
export function useLoginMethod(account: string | null): { method: LoginMethod | null; failed: boolean; retry: () => void } {
  const [providers, setProviders] = useState<{ account: string; list: string[] | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (account === null) return;
    let alive = true;
    void api.auth.accountProviders().then(list => { if (alive) setProviders({ account, list }); });
    return () => { alive = false; };
  }, [account, attempt]);

  const retry = useCallback(() => { setProviders(null); setAttempt(n => n + 1); }, []);

  if (account === null) return { method: 'guest', failed: false, retry };
  // 다른 계정으로 바뀐 직후에는 이전 계정의 수단을 쓰지 않는다
  const mine = providers?.account === account ? providers : null;
  return { method: loginMethodOf(account, mine?.list ?? null), failed: mine !== null && mine.list === null, retry };
}
