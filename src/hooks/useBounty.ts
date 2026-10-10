import { useCallback, useEffect, useState } from 'react';
import { readBounty } from '../api';
import type { BountySnapshot } from '../api';

// 수배판 스냅샷 조회 훅 — views의 readBounty 직접 참조를 이 뒤에 숨긴다.
// RQ 없이 수동 조회라 동작은 이전과 동일하다. 교체 시 이 내부만 RQ로 바뀐다.
// 반환형 { snap, loaded, refresh }는 RQ 이전·이후 동일하게 유지한다.
export function useBounty(refreshKey?: unknown) {
  const [snap, setSnap] = useState<BountySnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    let live = true;
    readBounty().then(s => { if (live) { setSnap(s); setLoaded(true); } });
    return () => { live = false; };
  }, []);

  // 마운트 1회 + 호출자가 준 키 변경(예: ResourceBar의 game) 시 재조회.
  // 수동 refresh(액션 성공 후)는 반환된 refresh로 한다.
  useEffect(refresh, [refresh, refreshKey]);

  return { snap, loaded, refresh };
}
