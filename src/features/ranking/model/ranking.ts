import { FISH } from '../../../game/content/fish';
import { NAMED } from '../../../game/content/named';
import type { RankingBoard, RankingBoardId, RankingWindow } from '../../../platform/api';

export type { RankingWindow } from '../../../platform/api';

// 순위표 파생 값·보드 메타.

export type MainRankingBoardId = Exclude<RankingBoardId, 'species'>;
export type RankingGroupId = 'ranking' | 'dex';

/** 주간·전체 누적 기간 전환을 지원하는 순위 표인지 판별한다 */
export const isPeriodRankingBoard = (board: RankingBoardId): boolean =>
  board === 'fame' || board === 'sellGold' || board === 'namedClears';

/** 보드별 기본 조회 기간 — 기간 지원 보드는 이번 주, 그 외는 전체 누적 */
export const defaultRankingWindow = (board: RankingBoardId): RankingWindow =>
  (isPeriodRankingBoard(board) ? 'weekly' : 'all');

export interface RankingTabMeta {
  key: MainRankingBoardId;
  label: string;
  valueLabel: string;
  help: string | null;
  total: number | null;
}

export const RANKING_TABS: readonly RankingTabMeta[] = [
  { key: 'fame', label: '명성', valueLabel: '명성', help: null, total: null },
  {
    key: 'sellGold',
    label: '판매골드',
    valueLabel: '판매 골드',
    help: '물고기 판매로 얻은 골드 합계예요.',
    total: null,
  },
  {
    key: 'namedClears',
    label: '네임드 토벌',
    valueLabel: '토벌 횟수',
    help: '네임드 토벌에 성공한 횟수예요.',
    total: null,
  },
  {
    key: 'dex',
    label: '일반',
    valueLabel: '발견 어종',
    help: '한 번이라도 낚은 일반 어종 수예요.',
    total: FISH.length,
  },
  {
    key: 'variant',
    label: '돌연변이',
    valueLabel: '발견 어종',
    help: '돌연변이로 한 번이라도 낚은 일반 어종 수예요.',
    total: FISH.length,
  },
  {
    key: 'named',
    label: '네임드',
    valueLabel: '발견 어종',
    help: '도감에 기록된 네임드 어종 수예요.',
    total: NAMED.length,
  },
];

export const RANKING_GROUPS: readonly { key: RankingGroupId; label: string; boards: readonly MainRankingBoardId[] }[] = [
  { key: 'ranking', label: '랭킹', boards: ['fame', 'sellGold', 'namedClears'] },
  { key: 'dex', label: '도감', boards: ['dex', 'variant', 'named'] },
];

export function rankingGroupOf(board: MainRankingBoardId): RankingGroupId {
  return RANKING_GROUPS.find(g => g.boards.includes(board))?.key ?? 'ranking';
}

const TAB_BY_ID: Readonly<Record<MainRankingBoardId, RankingTabMeta>> = Object.fromEntries(
  RANKING_TABS.map(tab => [tab.key, tab]),
) as Record<MainRankingBoardId, RankingTabMeta>;

export const rankingTabMeta = (board: MainRankingBoardId): RankingTabMeta => TAB_BY_ID[board];

/** 보드별 점수 구조화 — 도감 보드는 현재값/전체/퍼센트 분리, 그 외 보드는 단일 문자열 */
export type RankingValueView =
  | { kind: 'ratio'; current: number; total: number; percent: number }
  | { kind: 'single'; text: string };

export function rankingValueView(board: MainRankingBoardId, value: number): RankingValueView {
  const total = TAB_BY_ID[board].total;
  if (total !== null) {
    const percent = total > 0 ? Math.round((value / total) * 100) : 0;
    return { kind: 'ratio', current: value, total, percent };
  }
  return { kind: 'single', text: formatRankingValue(board, value) };
}

/** 보드별 점수 표시 — 도감 보드는 발견 종 수(n / 전체)와 완성도(%)를 함께 보인다 */
export function formatRankingValue(board: MainRankingBoardId, value: number): string {
  const num = value.toLocaleString('ko-KR');
  const total = TAB_BY_ID[board].total;
  if (total !== null) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return `${num} / ${total.toLocaleString('ko-KR')} (${pct}%)`;
  }
  if (board === 'sellGold') return `${num}G`;
  if (board === 'namedClears') return `${num}회`;
  return num;
}

const DAY_MS = 86_400_000;

function formatMonthDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 주간 선택 상자 표시 라벨 — 이번 주면 '이번 주 (M월 D일 ~)', 지난 주간이면 'M월 D일 ~ M월 D일' */
export function formatRankingWeekLabel(weekStart: string, currentWeekStart?: string | null): string {
  const startText = formatMonthDay(weekStart);
  if (currentWeekStart && weekStart === currentWeekStart) {
    return `이번 주 (${startText} ~)`;
  }
  const endMs = Date.parse(`${weekStart}T00:00:00.000Z`) + 6 * DAY_MS;
  const endDay = new Date(endMs).toISOString().slice(0, 10);
  return `${startText} ~ ${formatMonthDay(endDay)}`;
}

/** 표 아래에 항상 고정할 내 순위. 순위가 없으면 null이다 */
export function pinnedMyRank(board: Pick<RankingBoard, 'top' | 'me'>): { rank: number; value: number } | null {
  return board.me ?? null;
}
