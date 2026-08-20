import type { TabKey } from '../tabs';

// 탭 픽셀 아이콘 — 12×12 그리드에 rect 셀을 찍는 방식 (외부 아이콘 라이브러리 없음)
// currentColor를 쓰므로 탭 활성/비활성 색을 그대로 따라간다. holes는 투명으로 뚫는 부분.
type Cell = [x: number, y: number, w: number, h: number];

const ICONS: Record<TabKey, { cells: Cell[]; holes?: Cell[] }> = {
  // 지역: 나침반 (원형 테두리 + 대각 바늘)
  region: {
    cells: [
      [4, 0, 4, 1], [2, 1, 2, 1], [8, 1, 2, 1], [1, 2, 1, 2], [10, 2, 1, 2],
      [0, 4, 1, 4], [11, 4, 1, 4], [1, 8, 1, 2], [10, 8, 1, 2],
      [2, 10, 2, 1], [8, 10, 2, 1], [4, 11, 4, 1],
      [7, 3, 2, 2], [5, 5, 2, 2], [3, 7, 2, 2],
    ],
  },
  // 가방: 배낭 (몸통 + 손잡이 + 주머니 구멍)
  bag: {
    cells: [[4, 1, 4, 1], [3, 2, 1, 2], [8, 2, 1, 2], [2, 4, 8, 7]],
    holes: [[4, 6, 4, 2]],
  },
  // 도감: 책 (표지 + 페이지 줄 구멍)
  dex: {
    cells: [[2, 1, 8, 10]],
    holes: [[4, 3, 4, 1], [4, 5, 4, 1], [4, 7, 4, 1]],
  },
  // 도움말: 물음표
  help: {
    cells: [[3, 1, 6, 2], [8, 3, 2, 2], [6, 5, 3, 2], [5, 7, 2, 2], [5, 10, 2, 2]],
  },
  // 설정: 톱니 (십자+대각 이빨 + 몸통, 중앙 구멍)
  settings: {
    cells: [
      [5, 0, 2, 2], [5, 10, 2, 2], [0, 5, 2, 2], [10, 5, 2, 2],
      [1, 1, 2, 2], [9, 1, 2, 2], [1, 9, 2, 2], [9, 9, 2, 2],
      [3, 3, 6, 6],
    ],
    holes: [[5, 5, 2, 2]],
  },
};

export default function TabIcon({ tab }: { tab: TabKey }) {
  const { cells, holes } = ICONS[tab];
  return (
    <svg className="tab-icon" viewBox="0 0 12 12" width="16" height="16"
         shapeRendering="crispEdges" aria-hidden="true">
      <defs>
        <mask id={`tab-icon-mask-${tab}`}>
          <rect x="0" y="0" width="12" height="12" fill="white" />
          {holes?.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} fill="black" />
          ))}
        </mask>
      </defs>
      <g mask={`url(#tab-icon-mask-${tab})`}>
        {cells.map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}
