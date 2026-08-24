#!/usr/bin/env node
// 지형 마스크 생성기 — Natural Earth 벤더 데이터(src/world/geo/land-XXm.geo.json)를
// 지역 설정(tools/configs/<id>.json)대로 래스터라이즈해 TypeScript 모듈로 내보낸다.
//
// 사용법: node tools/mask-from-earth.mjs <configs/<id>.json 경로|inline-json> [--out <파일.ts>]
//   --out 없으면 rows만 stdout에 찍는다(view-mask.mjs로 눈 확인용).
//
// 설정 스키마:
//   id            산출 식별자(헤더/로그용)
//   geo           벤더 링 배열 JSON 경로(app 기준 상대)
//   cell          { w, h }  셀 픽셀(비등방 — 종횡비 보정용)
//   grid          { cols, rows }
//   window        { lonMin, lonMax, latMin, latMax }  경위도 창(단일 근원)
//   zones[]       { ch, name, lon, lat, rx, ry }  타원 특화 수역(육지 우선, 나중 항목 우선)
//   anchors{}     이름 → { lon, lat, dx?, dy?, terrain?: 'land'|'water' }
//                 경위도 → 픽셀 선형 투영 후 dx/dy(px) 오프셋. terrain 검증 실패 시 생성 중단.
//
// 철칙: 이 도구와 configs가 지형의 단일 근원이다. 런타임은 generated 모듈만 읽고
// 손으로 좌표를 찍지 않는다(앵커 하드코딩 금지 — decisions/real-earth-data).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const outFile = outIdx >= 0 ? argv.splice(outIdx, 2)[1] : null;
const src = argv[0];
if (!src) {
  console.error('사용법: node tools/mask-from-earth.mjs <configs/<id>.json|inline-json> [--out 파일.ts]');
  process.exit(2);
}

const readJson = p => JSON.parse(readFileSync(resolve(p), 'utf8').replace(/^\uFEFF/, ''));
const cfg = src.startsWith('{') ? JSON.parse(src) : readJson(src);

const { id = '(inline)', geo, zones = [], anchors = {} } = cfg;
const cellW = cfg.cell?.w ?? 8;
const cellH = cfg.cell?.h ?? 11;
const cols = cfg.grid?.cols;
const rows = cfg.grid?.rows;
const win = cfg.window;
if (!geo || !cols || !rows || !win ||
    [win.lonMin, win.lonMax, win.latMin, win.latMax].some(v => typeof v !== 'number')) {
  console.error(`[${id}] 설정 누락: geo, grid.cols/rows, window.lonMin/lonMax/latMin/latMax`);
  process.exit(2);
}

const LAND = 'L';
const W = cols * cellW, H = rows * cellH;
const dLon = (win.lonMax - win.lonMin) / cols; // °/열
const dLat = (win.latMax - win.latMin) / rows; // °/행

// --- 1. 육지 래스터 (짝수-홀수 레이캐스팅, 셀 중심 판정) ---
const landData = readJson(geo);
const ch = Array.from({ length: rows }, () => Array(cols).fill('.'));
let landCells = 0;

const pointInRing = (lon, lat, ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

for (const ring of landData.rings) {
  // 링 bbox → 후보 셀 범위 선계산 (±180 언랩은 벤더 단계에서 끝난 상태)
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  for (const [lo, la] of ring) {
    if (lo < lo0) lo0 = lo; if (lo > lo1) lo1 = lo;
    if (la < la0) la0 = la; if (la > la1) la1 = la;
  }
  const c0 = Math.max(0, Math.floor((lo0 - win.lonMin) / dLon));
  const c1 = Math.min(cols - 1, Math.ceil((lo1 - win.lonMin) / dLon));
  const r0 = Math.max(0, Math.floor((win.latMax - la1) / dLat));
  const r1 = Math.min(rows - 1, Math.ceil((win.latMax - la0) / dLat));
  if (c0 > c1 || r0 > r1) continue;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (ch[r][c] === LAND) continue;
      const lon = win.lonMin + (c + 0.5) * dLon;
      const lat = win.latMax - (r + 0.5) * dLat;
      if (pointInRing(lon, lat, ring)) { ch[r][c] = LAND; landCells++; }
    }
  }
}

// --- 2. 특화 수역 스탬프 (육지 우선, 나중 항목 우선) ---
const warns = [];
for (const z of zones) {
  if (!z.ch || z.ch === LAND || typeof z.lon !== 'number' || typeof z.lat !== 'number' ||
      !z.rx || !z.ry) {
    console.error(`[${id}] 잘못된 zone: ${JSON.stringify(z)}`);
    process.exit(2);
  }
  let n = 0;
  const rc = Math.ceil(z.ry / dLat), cc = Math.ceil(z.rx / dLon);
  const zr0 = Math.max(0, Math.round((win.latMax - z.lat) / dLat) - rc);
  const zr1 = Math.min(rows - 1, Math.round((win.latMax - z.lat) / dLat) + rc);
  const zc0 = Math.max(0, Math.round((z.lon - win.lonMin) / dLon) - cc);
  const zc1 = Math.min(cols - 1, Math.round((z.lon - win.lonMin) / dLon) + cc);
  for (let r = zr0; r <= zr1; r++) {
    for (let c = zc0; c <= zc1; c++) {
      if (ch[r][c] === LAND) continue;
      const dLo = (win.lonMin + (c + 0.5) * dLon - z.lon) / z.rx;
      const dLa = (z.lat - (win.latMax - (r + 0.5) * dLat)) / z.ry;
      if (dLo * dLo + dLa * dLa <= 1) { ch[r][c] = z.ch; n++; }
    }
  }
  if (!n) warns.push(`zone '${z.ch}'(${z.name ?? ''}) 가 한 칸도 찍히지 않았다`);
}

// --- 3. 앵커 투영 + 지형 검증 (하드코딩 좌표의 대체재 — 경위도가 단일 근원) ---
const project = a => ({
  x: Math.round(((a.lon - win.lonMin) / (win.lonMax - win.lonMin)) * W + (a.dx ?? 0)),
  y: Math.round(((win.latMax - a.lat) / (win.latMax - win.latMin)) * H + (a.dy ?? 0)),
});
const errors = [];
const projected = {};
for (const [name, a] of Object.entries(anchors)) {
  if (typeof a.lon !== 'number' || typeof a.lat !== 'number') {
    errors.push(`앵커 ${name}: lon/lat 숫자 필요`); continue;
  }
  const p = project(a);
  projected[name] = p;
  const cc = Math.floor(p.x / cellW), rr = Math.floor(p.y / cellH);
  if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) {
    errors.push(`앵커 ${name}: (${p.x},${p.y}) 가 격자 밖`); continue;
  }
  const cur = ch[rr][cc];
  if (a.terrain === 'land' && cur !== LAND) {
    errors.push(`앵커 ${name}: (${p.x},${p.y}) 육지여야 하는데 '${cur}' — lon/lat/dx/dy 조정 필요`);
  } else if (a.terrain === 'water' && cur === LAND) {
    errors.push(`앵커 ${name}: (${p.x},${p.y}) 물이어야 하는데 육지 — lon/lat/dx/dy 조정 필요`);
  }
}

// --- 4. 종횡비 정합 리포트 (경고만 — 게임 판단은 사람 몫) ---
const pxPerDegLon = W / (win.lonMax - win.lonMin);
const pxPerDegLat = H / (win.latMax - win.latMin);
const midLat = (win.latMax + win.latMin) / 2;
const idealRatio = 1 / Math.cos(midLat * Math.PI / 180);
const ratio = (pxPerDegLat / pxPerDegLon) / idealRatio;

console.error(`[${id}] 격자 ${cols}x${rows}셀(${W}x${H}px) · 창 lon ${win.lonMin}..${win.lonMax} lat ${win.latMin}..${win.latMax} · 육지 ${landCells}칸`);
console.error(`[${id}] 종횡비 px/°경=${pxPerDegLon.toFixed(1)} px/°위=${pxPerDegLat.toFixed(1)} · 위도 ${midLat}° 기준 이상비 대비 ${(ratio * 100).toFixed(0)}%${Math.abs(ratio - 1) > 0.12 ? '  ⚠ 12% 초과 권장 이탈' : ''}`);
for (const [name, p] of Object.entries(projected)) {
  console.error(`[${id}] 앵커 ${name} = (${p.x},${p.y})${anchors[name].terrain ? `[${anchors[name].terrain}]` : ''}`);
}

if (!outFile) {
  // 눈 확인 모드는 검증 실패와 무관하게 rows부터 보여준다 (좌표 조정 루프용)
  console.log(ch.map(r => r.join('')).join('\n'));
  warns.forEach(w => console.warn(`⚠ ${w}`));
}
if (errors.length) {
  for (const e of errors) console.error(`[${id}] 오류: ${e}`);
  process.exit(1);
}

// --- 5. 내보내기 ---
const rowsTs = ch.map(r => `  '${r.join('')}',`).join('\n');
const anchorsTs = Object.entries(projected)
  .map(([name, p]) => `  ${safeIdent(name)}: { x: ${p.x}, y: ${p.y} },`)
  .join('\n');

const relCfg = src.startsWith('{') ? '(inline)' : src.replaceAll('\\', '/');
const module_ = `// AUTO-GENERATED — tools/mask-from-earth.mjs 산출물. 손편집 금지.
// 재생성: node tools/mask-from-earth.mjs ${relCfg} --out ${outFile.replaceAll('\\', '/')}
// 출처: ${landData.source}
export const CELL_W = ${cellW};
export const CELL_H = ${cellH};
export const WINDOW: { lonMin: number; lonMax: number; latMin: number; latMax: number } =
  { lonMin: ${win.lonMin}, lonMax: ${win.lonMax}, latMin: ${win.latMin}, latMax: ${win.latMax} };
export const COLS = ${cols};
export const ROWS = ${rows};
export const MASK_ROWS: string[] = [
${rowsTs}
];
export const ANCHORS: Record<string, { x: number; y: number }> = {
${anchorsTs}
};
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, module_);
console.error(`[${id}] → ${outFile} 기록 완료 (${cols * rows}셀, 앵커 ${Object.keys(projected).length}개)`);
warns.forEach(w => console.warn(`⚠ ${w}`));

function safeIdent(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;
}
