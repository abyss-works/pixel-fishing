// 운세 이력 — 서버 함수(GET /api/fortune/history)를 부른다.
// 클라우드 미설정(로컬 dev·테스트)이면 null을 돌려주고, 요청 실패는 던진다.
import { isCloud } from './auth';
import type { FortuneHistory } from '../api/types';
import { throwRequestFailure } from './requestFailure';

/** 로그인 계정의 월별 운세 이력과 오늘 운세, 누적 발견 점괘 목록을 읽는다 */
export async function readFortuneHistory(month?: string): Promise<FortuneHistory | null> {
  if (!isCloud) return null;
  const url = month !== undefined ? `/api/fortune/history?month=${encodeURIComponent(month)}` : '/api/fortune/history';
  const res = await fetch(url);
  if (!res.ok) await throwRequestFailure(res, 'fortune history read failed');
  const data = await res.json() as FortuneHistory;
  return {
    ...data,
    discovered: Array.isArray(data.discovered) ? data.discovered : [],
  };
}
