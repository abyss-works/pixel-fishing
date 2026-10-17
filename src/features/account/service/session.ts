import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../../platform/api';

// 세션 게이트 — 서버를 읽는 모든 흐름의 유일한 선행 단계.
// 익명 세션 확보(없으면 익명 로그인)는 이 쿼리 하나로 앱 전체에서 한 번만 직렬로 실행된다.
// 부트스트랩은 fetchSession으로 이 단계를 기다린 뒤 서버 상태를 읽고, 화면이 쓰는 서버 조회는
// useSession의 ready를 enabled로, uid를 쿼리 키로 받아 세션이 선 뒤 서로 병렬로 나간다.
// 계정을 바꾸면 setSessionUid로 uid를 갱신해 uid 키를 쓰는 조회가 새 계정으로 다시 읽힌다.

export const sessionKey = ['session'] as const;

const sessionQuery = {
  queryKey: sessionKey,
  queryFn: () => api.auth.ensureSession(),
  staleTime: Infinity,
  gcTime: Infinity,
};

export interface SessionGate {
  /** 서버 조회를 보내도 되는가 */
  ready: boolean;
  uid: string | null;
}

/** 확보 결과 → 게이트. undefined = 확보 중. 클라우드 미설정(로컬 모드)은 세션 없이 준비된 것으로 본다 */
export function toGate(uid: string | null | undefined, configured: boolean): SessionGate {
  if (uid === undefined) return { ready: false, uid: null };
  return { ready: uid !== null || !configured, uid };
}

export function useSession(): SessionGate {
  const q = useQuery(sessionQuery);
  return toGate(q.data, api.auth.isConfigured);
}

/** 부트스트랩의 직렬 단계 — 이미 진행 중인 확보가 있으면 그 결과를 함께 기다린다 */
export const fetchSession = (client: QueryClient): Promise<string | null> =>
  client.fetchQuery(sessionQuery);

/** 계정 교체 뒤 새 세션의 uid로 게이트를 갱신한다 */
export function setSessionUid(client: QueryClient, uid: string | null): void {
  client.setQueryData(sessionKey, uid);
}
