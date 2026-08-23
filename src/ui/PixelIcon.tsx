import { cx } from './cx';

// 인라인 픽셀 아이콘 — TabIcon과 같은 12×12 rect 기법, currentColor로 글자색을 따른다.
// 이모지 금지 정책(v0.4.2)의 대체재: UI 크롬의 그림 기호는 전부 여기서 찍는다.
// holes는 마스크로 뚫는 부분(자물쇠 열쇠구멍 등).
type Cell = [x: number, y: number, w: number, h: number];

export type GlyphId =
  | 'coin' | 'star' | 'boat' | 'rod' | 'fish'
  | 'lock' | 'lockOpen' | 'checkOn' | 'checkOff'
  | 'caretRight' | 'caretDown' | 'checkPartial';

const GLYPHS: Record<GlyphId, { cells: Cell[]; holes?: Cell[] }> = {
  // 접힘/펼침 — 계단식 삼각형 (안티에일리어싱 없이 도트로 각을 낸다)
  caretRight: {
    cells: [[4, 2, 2, 8], [6, 4, 2, 4], [8, 6, 2, 2]],
  },
  caretDown: {
    cells: [[2, 4, 8, 2], [4, 6, 4, 2], [6, 8, 2, 2]],
  },
  // 골드: 팔각 링 동전 + 세로 홈
  coin: {
    cells: [
      [4, 1, 4, 1], [2, 2, 2, 1], [8, 2, 2, 1], [1, 3, 1, 6], [10, 3, 1, 6],
      [2, 9, 2, 1], [8, 9, 2, 1], [4, 10, 4, 1], [5, 4, 2, 4],
    ],
  },
  // 명성: 4방 스파클
  star: {
    cells: [[5, 1, 2, 2], [5, 9, 2, 2], [1, 5, 2, 2], [9, 5, 2, 2], [4, 4, 4, 4], [3, 5, 6, 2], [5, 3, 2, 6]],
  },
  // 배: 돛 + 선체
  boat: {
    cells: [[5, 1, 1, 6], [6, 1, 4, 2], [6, 3, 3, 2], [1, 7, 10, 2], [2, 9, 8, 1]],
  },
  // 낚싯대: 대각 낚싯대 + 낚싯줄 + 바늘
  rod: {
    cells: [[1, 9, 2, 2], [3, 7, 2, 2], [5, 5, 2, 2], [7, 3, 2, 2], [9, 1, 2, 2], [10, 3, 1, 5], [9, 8, 2, 1], [9, 7, 1, 1]],
  },
  // 가방(어획): 물고기 실루엣
  fish: {
    cells: [[1, 5, 1, 2], [2, 4, 6, 4], [8, 3, 2, 2], [8, 7, 2, 2], [8, 5, 1, 2]],
  },
  // 잠김: 걸쇠 닫힘 + 몸통(열쇠구멍)
  lock: {
    cells: [[3, 1, 6, 1], [3, 2, 1, 2], [8, 2, 1, 2], [2, 4, 8, 7]],
    holes: [[5, 6, 2, 3]],
  },
  // 풀림: 걸쇠가 왼쪽으로 열림
  lockOpen: {
    cells: [[1, 1, 6, 1], [1, 2, 1, 2], [6, 2, 1, 1], [2, 4, 8, 7]],
    holes: [[5, 6, 2, 3]],
  },
  // 체크박스: 테두리 + 체크
  checkOn: {
    cells: [
      [0, 0, 12, 1], [0, 11, 12, 1], [0, 1, 1, 10], [11, 1, 1, 10],
      [2, 5, 2, 2], [4, 7, 2, 2], [6, 5, 2, 2], [8, 3, 2, 2],
    ],
  },
  checkOff: {
    cells: [[0, 0, 12, 1], [0, 11, 12, 1], [0, 1, 1, 10], [11, 1, 1, 10]],
  },
  // 일부만 선택 — 체크 대신 가로 막대 (전체/없음과 한눈에 구분된다)
  checkPartial: {
    cells: [[0, 0, 12, 1], [0, 11, 12, 1], [0, 1, 1, 10], [11, 1, 1, 10], [3, 5, 6, 2]],
  },
};

let maskSeq = 0;

export default function PixelIcon({ glyph, size = 12, className }: {
  glyph: GlyphId; size?: number; className?: string;
}) {
  const { cells, holes } = GLYPHS[glyph];
  const maskId = holes ? `pxi-${glyph}-${maskSeq++}` : undefined;
  const rects = cells.map(([x, y, w, h], i) => (
    <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
  ));
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges"
         aria-hidden="true" className={cx('inline-block align-[-1px]', className)}>
      {holes ? (
        <>
          <defs>
            <mask id={maskId}>
              <rect x="0" y="0" width="12" height="12" fill="white" />
              {holes.map(([x, y, w, h], i) => (
                <rect key={i} x={x} y={y} width={w} height={h} fill="black" />
              ))}
            </mask>
          </defs>
          <g mask={`url(#${maskId})`}>{rects}</g>
        </>
      ) : rects}
    </svg>
  );
}
