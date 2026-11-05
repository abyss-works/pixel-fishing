import type { RankingBoard } from '../../../platform/api';

// 순위표 파생 값.

/** 표 아래에 따로 고정할 내 순위. 내가 상위 목록 안에 있거나 순위가 없으면 null이다 */
export function pinnedMyRank(board: Pick<RankingBoard, 'top' | 'me'>): { rank: number; value: number } | null {
  if (!board.me || board.top.some(row => row.me)) return null;
  return board.me;
}
