// 운세 이력 — 서버 함수(GET /api/fortune/history)를 부른다.
// 클라우드 미설정(로컬 dev·테스트)이면 null을 돌려주고, 요청 실패는 던진다.
import { isCloud } from './auth';
import type { FortuneHistory } from '../api/types';
import { requestFailure } from './requestFailure';

/** 로그인 계정의 오늘·이번 주·지난주 운세 이력을 읽는다 */
export async function readFortuneHistory(): Promise<FortuneHistory | null> {
  if (!isCloud) return null;
  const res = await fetch('/api/fortune/history');
  if (!res.ok) throw requestFailure(res, 'fortune history read failed');
  return await res.json() as FortuneHistory;
}
