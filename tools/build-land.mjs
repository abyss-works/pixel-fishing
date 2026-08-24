// 지형 데이터 빌드 — world-atlas TopoJSON을 렌더용 링 배열 JSON으로 변환한다.
// 사용법: node tools/build-land.mjs <land-XXm.json 경로> [단순화 허용오차(°)]
// 산출: src/world/geo/land-XXm.geo.json  (Natural Earth 퍼블릭 도메인 파생)
// 재실행 시점은 데이터 갱신 시만 — 런타임은 이 산출물만 읽는다(CDN/fetch 금지).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = process.argv[2] ?? process.env.TEMP + '/land-110m.json';
const tag = src.match(/land-(\d+m)/)?.[1] ?? '110m';
const EPS_DEG = Number(process.argv[3] ?? 0.03);
const topo = JSON.parse(readFileSync(src, 'utf8'));
const [sx, sy] = topo.transform.scale;
const [tx, ty] = topo.transform.translate;

// TopoJSON 디코딩 — 아크는 델타 인코딩(누적) + 양자화 역변환
const decodeArc = (a) => {
  let x = 0, y = 0;
  return a.map(([dx, dy]) => {
    x += dx; y += dy;
    return [x * sx + tx, y * sy + ty];
  });
};
const arcs = topo.arcs.map(decodeArc);

const ringFromIndices = (idxs) => {
  const pts = [];
  for (const idx of idxs) {
    const rev = idx < 0;
    const a = arcs[rev ? ~idx : idx].slice();
    if (rev) a.reverse();
    if (pts.length) a.shift(); // 접합부 중복점 제거
    pts.push(...a);
  }
  if (pts.length > 1) {
    const f = pts[0], l = pts[pts.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) pts.pop();
  }
  return pts.map(([lo, la]) => [Math.round(lo * 100) / 100, Math.round(la * 100) / 100]);
};

// 링 단순화 — Douglas–Peucker(허용오차 °). 등간격 소거는 만 점짜리 대륙 링을
// 자교시켜 짝수-홀수 내부 판정을 깨뜨린다(중국 대륙 소실 사건) — 형태 보존 방식만 쓴다.
const perpDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const simplifyDP = (pts, eps) => {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 <= i0 + 1) continue;
    let maxD = -1, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perpDist(pts[i], pts[i0], pts[i1]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) { keep[idx] = 1; stack.push([i0, idx], [idx, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
};
const simplifyRing = (pts) => {
  if (pts.length < 4 || EPS_DEG <= 0) return pts;
  const s = simplifyDP(pts, EPS_DEG);
  return s.length >= 4 ? s : pts;
};

// 반자오선 처리 — 재배치 금지. 경도 스프레드는 평행이동에 불변이라 {0,±360} 프레임
// 선택은 항상 동점이고 부동소수점 노이즈가 링을 반대 반구로 밀어버린다(보르네오 소실 사건).
// NE는 다각형을 ±180에서 절단하지만 그 래퍼 엣지는 북극권(~65N 이상)에 있어 이 게임의
// 창(lat ≤ 44N, lon 93~157)과 무관하고, ±180 걸친 섬들도 창 밖이다 — 원본 좌표가 정답.

let geom = topo.objects.land;
if (geom.type === 'GeometryCollection') geom = geom.geometries[0];
const polys = geom.type === 'MultiPolygon' ? geom.arcs : [geom.arcs];

const rings = [];
for (const poly of polys) {
  for (const ringIdxs of poly) {
    const r = simplifyRing(ringFromIndices(ringIdxs));
    if (r.length >= 4) rings.push(r); // 삼각형 미만 미세 조각 폐기
  }
}

mkdirSync('src/world/geo', { recursive: true });
const out = `src/world/geo/land-${tag}.geo.json`;
writeFileSync(out, JSON.stringify({
  source: `Natural Earth via world-atlas@2 land-${tag} — public domain`,
  rings,
}));
const totalPts = rings.reduce((n, r) => n + r.length, 0);
console.log(`rings=${rings.length} pts=${totalPts} bytes=${JSON.stringify({ rings }).length}`);
