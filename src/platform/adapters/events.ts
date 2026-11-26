// 라이브 이벤트 현황 — 서버 함수(GET /api/events)를 부른다.
// 클라우드 미설정(로컬 dev·테스트)이면 null을 돌려주고, 요청 실패는 던진다.
import { isCloud } from './auth';
import type { EventsSnapshot } from '../api/types';
import { throwRequestFailure } from './requestFailure';

/** 현재 진행·예정·최근 종료 라이브 이벤트 스냅샷과 내 진행 상태를 읽는다 */
export async function readEvents(): Promise<EventsSnapshot | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/events');
  if (!res.ok) await throwRequestFailure(res, 'events read failed');
  return await res.json() as EventsSnapshot;
}
