// 지형 마스크 컴파일러 — 문자 격자(rows)를 격자 판정용 코드 배열로 바꾼다.
// "작성은 ASCII, 판정은 격자 조회, 렌더는 픽셀" — 저작 편의와 실행 구조를 분리하는 유일한 층.
// 셀은 비등방(cellW×cellH): 세로 배율로 지형 종횡비를 조정한다(기본 1:1, 항해 지역 8×11).
import type { CompiledMap, MapCellDef, Point, Rect } from './types';

/** 격자(창)가 전지구 격자 안에서 놓인 자리 — 생성 마스크가 싣는 값이다 */
export interface GridPlacement { colOffset: number; rowOffset: number; globalCols: number }

/** placement를 생략하면 격자의 서북 모서리가 원점이다(전지구 격자를 쓰지 않는 마스크) */
export function compileMap(
  cellW: number,
  cellH: number,
  legend: Record<string, MapCellDef>,
  rows: string[],
  placement?: GridPlacement,
): CompiledMap {
  const cols = rows[0]?.length ?? 0;
  const codes = new Uint8Array(cols * rows.length);
  const palette: (MapCellDef | undefined)[] = [];
  const indexOf = new Map<string, number>();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.length !== cols) throw Error(`마스크 ${r}행 길이 ${row.length} ≠ ${cols}`);
    for (let c = 0; c < cols; c++) {
      const ch = row[c];
      let i = indexOf.get(ch);
      if (i === undefined) {
        const def = legend[ch];
        if (!def) throw Error(`마스크 ${r}:${c} 알 수 없는 문자 '${ch}'`);
        i = palette.length; // 코드 = palette 인덱스 (0부터 — 모든 칸에 문자가 있으니 예약 슬롯 불필요)
        palette.push(def);
        indexOf.set(ch, i);
      }
      codes[r * cols + c] = i;
    }
  }
  const { colOffset, rowOffset, globalCols } = placement ?? { colOffset: 0, rowOffset: 0, globalCols: cols };
  return {
    cellW, cellH, cols, rows: rows.length, codes, palette,
    colOffset, rowOffset, globalCols, originX: colOffset * cellW, originY: rowOffset * cellH,
  };
}

/** 격자(창)가 차지하는 게임 좌표 영역 */
export function mapBounds(map: CompiledMap): Rect {
  return { x: map.originX, y: map.originY, w: map.cols * map.cellW, h: map.rows * map.cellH };
}

/** 게임 좌표 → 격자 안 (열, 행). 격자 밖이면 null */
export function localCell(map: CompiledMap, x: number, y: number): { c: number; r: number } | null {
  const c = Math.floor((x - map.originX) / map.cellW), r = Math.floor((y - map.originY) / map.cellH);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return null;
  return { c, r };
}

/** 게임 좌표 → 셀 정의 (격자 밖이면 undefined) */
export function cellDefAt(map: CompiledMap, x: number, y: number): MapCellDef | undefined {
  const cell = localCell(map, x, y);
  return cell ? map.palette[map.codes[cell.r * map.cols + cell.c]] : undefined;
}

/** 격자 안 (열, 행) → 전지구 칸 인덱스. 창이 바뀌어도 같은 칸은 같은 인덱스다 */
export function cellIndex(map: CompiledMap, c: number, r: number): number {
  return (r + map.rowOffset) * map.globalCols + c + map.colOffset;
}

/** 전지구 칸 인덱스 → 칸 중앙의 게임 좌표. 세로는 11px라 반 칸을 내림해 정수 좌표를 유지한다 */
export function indexCenter(map: CompiledMap, idx: number): Point {
  const col = idx % map.globalCols, row = (idx - col) / map.globalCols;
  return { x: col * map.cellW + Math.floor(map.cellW / 2), y: row * map.cellH + Math.floor(map.cellH / 2) };
}

/** 수역 라벨 앵커 파생 — 같은 label을 가진 셀 군집의 bbox 상단 중앙.
 *  마스크 재생성/수역 이동 시 라벨이 자동 추적한다 (하드코딩 금지 규칙). */
export function zoneLabelAnchors(map: CompiledMap): { text: string; x: number; y: number }[] {
  const boxes = new Map<number, { x0: number; x1: number; r0: number }>();
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const code = map.codes[r * map.cols + c];
      const def = map.palette[code];
      if (!def?.label) continue;
      const b = boxes.get(code);
      if (b) { b.x0 = Math.min(b.x0, c); b.x1 = Math.max(b.x1, c); b.r0 = Math.min(b.r0, r); }
      else boxes.set(code, { x0: c, x1: c, r0: r });
    }
  }
  return [...boxes.entries()].map(([code, b]) => ({
    text: map.palette[code]?.label ?? '',
    x: map.originX + ((b.x0 + b.x1 + 1) / 2) * map.cellW,
    y: map.originY + b.r0 * map.cellH,
  }));
}
