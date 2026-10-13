// 지형 마스크 컴파일러 — 문자 격자(rows)를 격자 판정용 코드 배열로 바꾼다.
// "작성은 ASCII, 판정은 격자 조회, 렌더는 픽셀" — 저작 편의와 실행 구조를 분리하는 유일한 층.
// 셀은 비등방(cellW×cellH): 세로 배율로 지형 종횡비를 조정한다(기본 1:1, 항해 지역 8×11).
import type { CompiledMap, MapCellDef } from './types';

export function compileMap(
  cellW: number,
  cellH: number,
  legend: Record<string, MapCellDef>,
  rows: string[],
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
  return { cellW, cellH, cols, rows: rows.length, codes, palette };
}

/** 픽셀 좌표 → 셀 정의 (격자 밖이면 undefined) */
export function cellDefAt(map: CompiledMap, x: number, y: number): MapCellDef | undefined {
  const c = Math.floor(x / map.cellW), r = Math.floor(y / map.cellH);
  if (c < 0 || r < 0 || c >= map.cols || r >= map.rows) return undefined;
  return map.palette[map.codes[r * map.cols + c]];
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
    x: ((b.x0 + b.x1 + 1) / 2) * map.cellW,
    y: b.r0 * map.cellH,
  }));
}
