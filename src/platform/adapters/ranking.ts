// 랭킹 읽기 — 서버 읽기 함수(/api/rank)를 부른다. 다른 사용자의 행을 표에서 직접 읽지 않는다.
// 세션 쿠키가 있으면 내 순위가 함께 온다. 클라우드 미설정(로컬 dev·테스트)이면 null — 화면이 오프라인 안내를 띄운다.
// 그 밖의 실패는 null로 숨기지 않고 던진다(조회가 다시 시도한다).
import { isCloud } from './auth';
import type { RankingBoard, RankingBoardId, RankingWindow } from '../api/types';
import { throwRequestFailure } from './requestFailure';

/** board가 species면 fishId 어종의 순위다. window를 주면 주간·누적 기간을 함께 요청한다 */
export async function readRanking(
  board: RankingBoardId,
  fishId?: string,
  window?: RankingWindow,
): Promise<RankingBoard | null> {
  if (!isCloud) return null;
  const params = new URLSearchParams({ board });
  if (board === 'species') params.set('fish', fishId ?? '');
  if (window) params.set('window', window);
  const res = await fetch(`/api/rank?${params.toString()}`);
  if (!res.ok) await throwRequestFailure(res, 'ranking read failed');
  return await res.json() as RankingBoard;
}
