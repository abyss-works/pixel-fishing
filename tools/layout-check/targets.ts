// 레이아웃 폭 검사의 대상 - 뷰포트 폭 목록과 두 가지 상태의 세이브.
import { reduceDebug } from '../../src/game/rules/debug';
import { FISH } from '../../src/game/content/fish';
import { MAX_BOAT, capOfBoat, migrate, newState } from '../../src/game/rules/logic';
import type { GameState } from '../../src/game/rules/logic';
import { fmtCompact, fmtCompact3 } from '../../src/presentation/ui/format';
import type { TierBounds, TierId } from './judge';

/** 뷰포트 높이 */
export const VIEWPORT_HEIGHT = 800;

/** 지원 크기 */
const SUPPORTED_WIDTHS = [1280, 1920];
/** 경계와 지원 크기 사이를 메우는 중간 폭. 숫자마다 고른 이유를 적는다 */
const MID_WIDTHS = [
  812, // 판정 경계 바로 위. 메시지 창과 칩 줄이 겹치는 알려진 구간(768~811)의 위쪽 끝을 지난다
  900, // 두 행 단계의 가운데(스테이지 폭 516)
  1198, // 기본 단계의 가운데(스테이지 폭 814)
];

/** 미디어 쿼리 `(width < Nrem)`의 N을 px로 바꾼다. 브라우저 기본 글자 크기 16px 기준이다 */
export function breakpointPx(query: string): number {
  const m = /^\(width < ([\d.]+)rem\)$/.exec(query);
  if (!m) throw new Error(`레이아웃 판정 질의의 형식이 예상과 다릅니다: ${query}`);
  return Number(m[1]) * 16;
}

/** PC 레이아웃의 뷰포트 폭 목록(오름차순). 판정 경계, 헤더 단계 경계의 바로 아래와 위(스테이지 폭 = 뷰포트 폭 - 사이드바), 지원 크기, 중간 폭 */
export function buildWidths(src: { layoutBreak: number; bounds: TierBounds; sidebar: number }): number[] {
  const { layoutBreak, bounds, sidebar } = src;
  const edges = [bounds.tight, bounds.wide].flatMap(b => [b - 1 + sidebar, b + sidebar]);
  return [...new Set([layoutBreak, ...edges, ...SUPPORTED_WIDTHS, ...MID_WIDTHS])]
    .filter(w => w >= layoutBreak)
    .sort((a, b) => a - b);
}

/** 게스트 세이브의 저장소 키. 게스트 게이트웨이와 레거시 이관 두 곳이 각자 비공개 상수로 갖고 있어 가져올 수 없다 */
export const SAVE_KEY = 'pixel-fishing-save';

/** 헤더 단계가 골드와 명성에 쓰는 숫자 표기. 기본과 간격 축소는 같은 표기를 쓰고 두 행은 유효숫자 세 자리 표기를 쓴다 */
export const TIER_FORMAT: Record<TierId, (n: number) => string> = {
  default: fmtCompact, tight: fmtCompact, 'two-row': fmtCompact3,
};

/** 후보 값의 범위와 간격. 후보 중 표기가 가장 긴 값을 고른다 */
const CANDIDATE_MAX = 999_999;
const CANDIDATE_STEP = 100;

/** 표기 글자 수가 가장 많은 값. 같으면 큰 값 */
export function longestValue(format: (n: number) => string): number {
  let best = 0;
  for (let n = 0; n <= CANDIDATE_MAX; n += CANDIDATE_STEP) {
    if (format(n).length >= format(best).length) best = n;
  }
  return best;
}

const MAX_ROD = 99;

/** 자원 바가 가장 길게 나오는 상태 - 고른 골드와 명성, 최상위 배, 낚싯대 레벨 99, 가방 가득.
 *  개발 도구 명령(stats.set)의 리듀서로 스탯을 정하고, 가방은 배의 칸 수만큼 채운다 */
export function longestState(resource: number): GameState {
  const stats = reduceDebug(newState(), 'stats.set', { gold: resource, fame: resource, rod: MAX_ROD, boat: MAX_BOAT }, '2026-01-01');
  if (!stats) throw new Error('개발 도구 명령 stats.set이 최장 값 상태를 거부했습니다.');
  const bag = Array.from({ length: capOfBoat(MAX_BOAT) }, (_, i) => ({
    uid: `layout-check-${i}`, fishId: FISH[0].id, form: 'normal' as const, size: null, caughtAt: null, spot: null, judgment: null, locked: false,
  }));
  // 저장된 세이브를 읽는 경로(migrate)를 한 번 거쳐 제품이 읽을 수 있는 형식임을 보장한다
  return migrate({ ...stats, bag });
}
