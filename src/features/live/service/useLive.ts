import { useEffect } from 'react';
import { openLive } from '../../../platform/api';
import { useSession } from '../../account/service/session';

// 실시간 채널 연결 — 게임 화면이 떠 있는 동안 연결을 유지한다.
// 연결은 로그인 쿠키로 인증되므로 세션이 선 뒤 열고, 계정이 바뀌면 새 쿠키로 다시 연다.
export function useLive(): void {
  const { ready, uid } = useSession();
  useEffect(() => {
    if (!ready || !uid) return;
    const conn = openLive(() => {});
    return () => conn?.close();
  }, [ready, uid]);
}
