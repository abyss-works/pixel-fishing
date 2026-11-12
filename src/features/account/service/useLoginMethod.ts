import { useEffect, useState } from 'react';
import { api } from '../../../platform/api';
import { loginMethodOf } from '../model/googleFlow';
import type { LoginMethod } from '../model/googleFlow';

/** 지금 계정의 로그인 방식. 게스트는 바로 정해지고, 영구 계정은 붙은 로그인 수단을 읽는 동안과 읽지 못했을 때 null이다 */
export function useLoginMethod(account: string | null): LoginMethod | null {
  const [providers, setProviders] = useState<{ account: string; list: string[] | null } | null>(null);

  useEffect(() => {
    if (account === null) return;
    let alive = true;
    void api.auth.accountProviders().then(list => { if (alive) setProviders({ account, list }); });
    return () => { alive = false; };
  }, [account]);

  if (account === null) return 'guest';
  // 다른 계정으로 바뀐 직후에는 이전 계정의 수단을 쓰지 않는다
  return loginMethodOf(account, providers?.account === account ? providers.list : null);
}
