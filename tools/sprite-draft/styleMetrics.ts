// 원화 화풍 측정 — 기존 원화 집합에서 지표 분포를 내고, 원화 하나가 그 범위에 드는지 판정한다.
// 제품 코드가 아니라 원화 제작 검사용이다. 합격선은 기준 집합의 분포에서 계산하며 값을 따로 두지 않는다.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodePng } from './pngDecode';

/** 남대서양에서 새로 만든 어종. 기준 집합에서 빠지고 검사 대상이 된다. */
export const CANDIDATE_IDS = [
  'capeanchovy', 'capejack', 'capehake', 'snoek', 'kingfish', 'sthwrasse', 'sthpuffer',
  'apollodamsel', 'ascensionangel', 'wahoo', 'galapagosshark', 'nighthake', 'eolgedom', 'bigeye',
  'adamastor',
];

export const EYE_DARK = '#0b1322';
export const EYE_GLINT = '#f8fcff';

export interface Grid { w: number; h: number; cells: (string | null)[][] }

export function gridFromRows(rows: string[], colors: Record<string, string>): Grid {
  const w = Math.max(...rows.map(r => r.length));
  const cells = rows.map(r => Array.from({ length: w }, (_, x) => colors[r[x]] ?? null));
  return { w, h: rows.length, cells };
}

export function gridFromPng(buf: Buffer): Grid {
  const { w, h, px } = decodePng(buf);
  const cells: (string | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row.push(px[i + 3] === 0 ? null : '#' + [px[i], px[i + 1], px[i + 2]].map(v => v.toString(16).padStart(2, '0')).join(''));
    }
    cells.push(row);
  }
  return { w, h, cells };
}

export interface Metrics {
  /** 같은 색 4방향 연결 영역 수 */
  regions: number;
  /** 눈 색을 뺀 1픽셀 영역 수 */
  specks: number;
  /** 가로로 이웃한 불투명 쌍 가운데 같은 색인 비율 */
  hcoh: number;
  /** 가로 단색 연속 길이의 평균 */
  meanRun: number;
  /** 불투명 6칸 이상인 행 가운데 두 색 이하만 쓴 행의 비율 */
  bandRows: number;
  /** 가장 오른쪽 4열에 쓴 색 수 */
  tailColors: number;
  /** 열마다 불투명 칸을 센 최댓값 */
  bodyHeight: number;
  /** 바깥 사각형의 높이 / 너비 */
  aspect: number;
  /** 머리 쪽 세로 어두운 줄 묶음 수(최대 3) */
  gill: 0 | 1 | 2 | 3;
  /** 눈동자 칸 수(최대 4)와 반사광 유무, 예: '1g' */
  eye: string;
}

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

export function measure(g: Grid): Metrics {
  const { w, h, cells } = g;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? cells[y][x] : null);
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  const count = new Map<string, number>();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y][x];
    if (!c) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  if (x1 < 0) throw new Error('불투명 칸이 없습니다');

  // 같은 색 연결 영역
  const seen = new Set<number>();
  let regions = 0, specks = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = cells[y][x];
    if (!c || seen.has(y * w + x)) continue;
    regions++;
    let size = 0;
    const st: [number, number][] = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop()!;
      if (at(a, b) !== c || seen.has(b * w + a)) continue;
      seen.add(b * w + a); size++;
      st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    if (size === 1 && c !== EYE_DARK && c !== EYE_GLINT) specks++;
  }

  // 가로 이웃과 단색 연속
  let pairs = 0, same = 0, runs = 0, runSum = 0;
  for (let y = 0; y < h; y++) {
    let prev: string | null = null, len = 0;
    for (let x = 0; x <= w; x++) {
      const c = at(x, y);
      if (c && at(x + 1, y)) { pairs++; if (at(x + 1, y) === c) same++; }
      if (c && c === prev) len++;
      else { if (prev) { runs++; runSum += len; } len = 1; prev = c; }
    }
  }

  // 단색 밴드 행
  let rowsUsed = 0, bandRows = 0;
  for (let y = 0; y < h; y++) {
    const s = new Set<string>(); let k = 0;
    for (let x = 0; x < w; x++) { const c = cells[y][x]; if (c) { s.add(c); k++; } }
    if (k >= 6) { rowsUsed++; if (s.size <= 2) bandRows++; }
  }

  // 꼬리 끝
  const tail = new Set<string>();
  for (let y = 0; y < h; y++) for (let x = Math.max(0, x1 - 3); x <= x1; x++) { const c = cells[y][x]; if (c) tail.add(c); }

  let bodyHeight = 0;
  for (let x = x0; x <= x1; x++) { let n = 0; for (let y = 0; y < h; y++) if (cells[y][x]) n++; bodyHeight = Math.max(bodyHeight, n); }

  // 본체 색: 눈 색을 뺀 최빈 색
  const body = [...count.entries()].filter(([c]) => c !== EYE_DARK && c !== EYE_GLINT).sort((a, b) => b[1] - a[1])[0]?.[0];
  const bodyL = body ? lum(body) : 0.5;

  // 아가미: 머리 쪽 절반에서 본체보다 어두운 같은 색이 세로로 3칸 이상 이어진 열 묶음
  const gillCols: number[] = [];
  for (let x = x0; x <= x0 + 0.5 * (x1 - x0); x++) {
    let run = 1, hit = false;
    for (let y = 1; y < h; y++) {
      const a = cells[y][x], b = cells[y - 1][x];
      if (a && a === b && a !== EYE_DARK && lum(a) < 0.75 * bodyL) { run++; if (run >= 3) hit = true; } else run = 1;
    }
    if (hit) gillCols.push(x);
  }
  let groups = 0;
  gillCols.forEach((x, i) => { if (i === 0 || x !== gillCols[i - 1] + 1) groups++; });

  // 눈: 가장 큰 눈동자 덩어리의 칸 수와 맞닿은 반사광
  const eyeSeen = new Set<number>();
  let best: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (cells[y][x] !== EYE_DARK || eyeSeen.has(y * w + x)) continue;
    const comp: [number, number][] = [];
    const st: [number, number][] = [[x, y]];
    while (st.length) {
      const [a, b] = st.pop()!;
      if (at(a, b) !== EYE_DARK || eyeSeen.has(b * w + a)) continue;
      eyeSeen.add(b * w + a); comp.push([a, b]);
      st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
    }
    if (comp.length > best.length) best = comp;
  }
  const glint = best.some(([a, b]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(a + dx, b + dy) === EYE_GLINT));

  return {
    regions, specks,
    hcoh: pairs ? same / pairs : 0,
    meanRun: runs ? runSum / runs : 0,
    bandRows: rowsUsed ? bandRows / rowsUsed : 0,
    tailColors: tail.size,
    bodyHeight,
    aspect: (y1 - y0 + 1) / (x1 - x0 + 1),
    gill: Math.min(groups, 3) as Metrics['gill'],
    eye: `${Math.min(best.length, 4)}${glint ? 'g' : ''}`,
  };
}

export function percentile(values: number[], p: number): number {
  const a = [...values].sort((x, y) => x - y);
  return a[Math.round(p * (a.length - 1))];
}

export interface Dist { mean: number; min: number; max: number; p10: number; p90: number }
export const distOf = (values: number[]): Dist => ({
  mean: values.reduce((s, v) => s + v, 0) / values.length,
  min: Math.min(...values), max: Math.max(...values),
  p10: percentile(values, 0.1), p90: percentile(values, 0.9),
});

type NumKey = 'regions' | 'specks' | 'hcoh' | 'meanRun' | 'bandRows' | 'tailColors' | 'bodyHeight' | 'aspect';
/** 후보가 기준 하위 10% 값 이상이어야 하는 지표 */
export const LOWER_BOUND: NumKey[] = ['regions', 'specks', 'tailColors'];
/** 후보가 기준 상위 10% 값 이하여야 하는 지표 */
export const UPPER_BOUND: NumKey[] = ['hcoh', 'meanRun', 'bandRows'];
/** 후보가 기준의 최솟값과 최댓값 사이여야 하는 지표 */
export const RANGE_BOUND: NumKey[] = ['bodyHeight', 'aspect'];
/** 집합에서 한 모양이 차지할 수 있는 몫은 기준 집합의 몫에 이 값을 더한 만큼까지다 */
export const SHARE_MARGIN = 0.25;
/** 집합 단위로 요구하는 서로 다른 눈 모양 수의 하한 */
export const MIN_EYE_KINDS = 3;

export interface Criteria {
  n: number;
  dist: Record<NumKey, Dist>;
  eyeShare: Record<string, number>;
  gillShare: Record<string, number>;
}

const shareOf = (xs: (string | number)[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const x of xs) out[String(x)] = (out[String(x)] ?? 0) + 1 / xs.length;
  return out;
};

export function buildCriteria(ref: Metrics[]): Criteria {
  const keys = [...LOWER_BOUND, ...UPPER_BOUND, ...RANGE_BOUND];
  const dist = Object.fromEntries(keys.map(k => [k, distOf(ref.map(m => m[k]))])) as Criteria['dist'];
  return { n: ref.length, dist, eyeShare: shareOf(ref.map(m => m.eye)), gillShare: shareOf(ref.map(m => m.gill)) };
}

export function judgeSprite(m: Metrics, c: Criteria): string[] {
  const fails: string[] = [];
  const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  for (const k of LOWER_BOUND) if (m[k] < c.dist[k].p10) fails.push(`${k} ${f(m[k])} < 하한 ${f(c.dist[k].p10)}`);
  for (const k of UPPER_BOUND) if (m[k] > c.dist[k].p90) fails.push(`${k} ${f(m[k])} > 상한 ${f(c.dist[k].p90)}`);
  for (const k of RANGE_BOUND) {
    if (m[k] < c.dist[k].min || m[k] > c.dist[k].max) fails.push(`${k} ${f(m[k])} 범위 밖 [${f(c.dist[k].min)}, ${f(c.dist[k].max)}]`);
  }
  return fails;
}

/** 집합 단위 판정 — 눈과 아가미 모양이 한쪽으로 쏠리지 않아야 한다. */
export function judgeSet(ms: Metrics[], c: Criteria): string[] {
  const fails: string[] = [];
  const check = (name: string, got: Record<string, number>, ref: Record<string, number>) => {
    for (const [kind, share] of Object.entries(got)) {
      const limit = (ref[kind] ?? 0) + SHARE_MARGIN;
      if (share > limit + 1e-9) fails.push(`${name} '${kind}' 몫 ${share.toFixed(2)} > ${limit.toFixed(2)}`);
    }
  };
  check('눈', shareOf(ms.map(m => m.eye)), c.eyeShare);
  check('아가미', shareOf(ms.map(m => m.gill)), c.gillShare);
  const kinds = new Set(ms.map(m => m.eye)).size;
  if (kinds < Math.min(MIN_EYE_KINDS, Object.keys(c.eyeShare).length)) fails.push(`눈 모양 ${kinds}종 < ${MIN_EYE_KINDS}종`);
  return fails;
}

export interface Loaded { id: string; grid: Grid }

/** 폴더의 원화를 읽는다. keys를 주면 그 키(`id` 또는 `id.variant`)만, 없으면 일반 폼 전부에서 제외 목록을 뺀다. */
export function readSpriteDir(dir: string, exclude: Set<string>, keys?: string[]): Loaded[] {
  const names = keys ?? readdirSync(dir).filter(f => f.endsWith('.png') && !f.includes('.variant')).map(f => basename(f, '.png'));
  return names.filter(id => !exclude.has(id)).map(id => ({ id, grid: gridFromPng(readFileSync(join(dir, `${id}.png`))) }));
}
