// 마스크 지형 페인터 — CompiledMap 격자를 픽셀 지형으로 찍는다 (작성은 ASCII, 결과는 픽셀).
// 셀은 비등방(sw×sh) — 세로 배율은 map.cellH가 결정하고 여기는 반영만 한다.
// 연출: 바다 수직 그라데이션(북 밝음→남 어둠) · 연안 얕은 물 rim · 해안 모래 디더링 ·
// 특화 수역 내부 텍스처(홀 내벽 음영·녹 얼룩·산호 모틀) · 수역 라벨 자동 배치(label 파생).
import { R, label } from '../common.js';
import type { Ctx } from '../common.js';
import { WATER_STYLE } from '../styles.js';
import type { CompiledMap, MapCellDef, Rect } from '../../world/types';
import { zoneLabelAnchors } from '../../world/mask';

const LAND = '#74c69d', LAND_HI = '#8fd6b0', SAND = '#e9c46a', SPECK = '#2d6a4f';
const FAINT = 'rgba(242,247,251,0.5)';

// 흑백 톤 — toneRect 밖(미개척 세계). 무채색이되 물/육지의 명도 차는 유지해 해안선이 읽히게.
// 세계지도(atlas)가 구현 영역만 컬러로 비추는 "아직 가지 않은 바다" 연출용 (사용자 확정 2026-08-28).
const MONO_WATER_TOP: RGB = [86, 94, 102], MONO_WATER_BOT: RGB = [36, 41, 48];
const MONO_LAND = '#7e8882', MONO_LAND_HI = '#949e98', MONO_SAND = '#a8b0ac', MONO_SPECK = '#4c554f';

// 라벨 앵커 캐시 — zoneLabelAnchors는 지도 전체 셀을 순회한다(병합 바다 105k셀). 지도 객체는
// 모듈 상수라 같은 격자를 프레임마다 다시 훑을 이유가 없다(WeakMap — 지도 교체 시 자동 폐기).
const LABEL_CACHE = new WeakMap<CompiledMap, { text: string; x: number; y: number }[]>();

type RGB = readonly [number, number, number];
const rgbOf = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** 두 색 사이 선형 보간 — 수심 그라데이션용 */
const mix = (a: RGB, b: RGB, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

// 스타일별 수면(밝은 쪽)과 싱연(어두운 쪽) 색 쌍 — 토큰 값에서 파생
const GRAD = new Map<string, { top: RGB; bot: RGB }>();
function seaTones(style: keyof typeof WATER_STYLE) {
  let g = GRAD.get(style);
  if (!g) {
    const c = rgbOf(WATER_STYLE[style].fill);
    g = {
      top: [
        Math.min(c[0] + 34, 255), Math.min(c[1] + 40, 255), Math.min(c[2] + 44, 255),
      ] as RGB,
      bot: [
        Math.round(c[0] * 0.55), Math.round(c[1] * 0.62), Math.round(c[2] * 0.72),
      ] as RGB,
    };
    GRAD.set(style, g);
  }
  return g;
}

/** view = 카메라 뷰포트(월드 px) — 병합 바다처럼 격자가 큰 지형은 보이는 칸만 찍는다
 *  (오픈월드 Phase 3: 전체 순회는 26k셀 × 프레임이라 컬링 필수). 미지정 = 전체(미니맵).
 *  tone = 컬러 영역(월드 px) — 이 사각형 **밖**은 흑백 톤(세계지도의 미개척 연출). 미지정 = 전부 컬러. */
export function drawMaskTerrain(
  ctx: Ctx, map: CompiledMap, detail: boolean, t?: number, view?: Rect, tone?: Rect,
) {
  const sw = map.cellW, sh = map.cellH;
  const c0 = view ? Math.max(0, Math.floor(view.x / sw) - 1) : 0;
  const c1 = view ? Math.min(map.cols - 1, Math.ceil((view.x + view.w) / sw) + 1) : map.cols - 1;
  const r0 = view ? Math.max(0, Math.floor(view.y / sh) - 1) : 0;
  const r1 = view ? Math.min(map.rows - 1, Math.ceil((view.y + view.h) / sh) + 1) : map.rows - 1;
  // 흑백 판정 — 셀 중심 기준. 세로 경계는 행 단위, 가로 경계는 열 단위로 갈라진다.
  const monoCol = (c: number): boolean => {
    if (!tone) return false;
    const x = c * sw + sw / 2;
    return x < tone.x || x >= tone.x + tone.w;
  };
  const monoRow = (r: number): boolean => {
    if (!tone) return false;
    const y = r * sh + sh / 2;
    return y < tone.y || y >= tone.y + tone.h;
  };
  const at = (c: number, r: number): MapCellDef | undefined =>
    c >= 0 && r >= 0 && c < map.cols && r < map.rows ? map.palette[map.codes[r * map.cols + c]] : undefined;
  const isLand = (c: number, r: number): boolean => !!at(c, r)?.land;

  // 1패스 — 셀 채움 (가로 런 병합 + 행 비례 수심 그라데이션: 북=밝은 수면 → 남=깊은 바다)
  // 그라데이션은 전체 행수 기준 — 병합 바다에서 3구역이 하나의 수직 톤으로 이어진다.
  // 런 키에 흑백 플래그를 섞는다 — tone 경계에서 같은 문자라도 색이 갈라져야 하니까.
  for (let r = r0; r <= r1; r++) {
    const depth = map.rows > 1 ? r / (map.rows - 1) : 0;
    const rowMono = monoRow(r);
    let start = c0;
    let key = -1;
    for (let c = c0; c <= c1 + 1; c++) {
      const code = c <= c1 ? map.codes[r * map.cols + c] : -2;
      const mono = rowMono || monoCol(c);
      const k = code * 2 + (mono ? 1 : 0);
      if (k === key) continue;
      if (key >= 0) {
        const def = map.palette[(key - (key % 2)) / 2];
        const m = key % 2 === 1;
        let color: string;
        if (m) color = def?.land ? MONO_LAND : mix(MONO_WATER_TOP, MONO_WATER_BOT, depth);
        else if (def?.land) color = LAND;
        else {
          const st = (def?.style ?? 'sea') as keyof typeof WATER_STYLE;
          const tone2 = seaTones(st);
          color = mix(tone2.top, tone2.bot, depth);
        }
        R(ctx, start * sw, r * sh, (c - start) * sw, sh, color);
      }
      key = k;
      start = c;
    }
  }

  if (!detail) return; // 미니맵 — 평면 채움만

  // 2패스 — 해안·수역 장식 (이웃 조회 at()은 창 밖도 읽는다 — 경계 셀의 모래테가 끊기지 않게)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const def = at(c, r);
      const x = c * sw, y = r * sh;
      const mono = monoRow(r) || monoCol(c);
      const landFill = mono ? MONO_LAND_HI : LAND_HI;
      const sandFill = mono ? MONO_SAND : SAND;

      if (def?.land) {
        // 육지: 물 접촉변 모래테 + 북변 하이라이트 + 스펙클
        if (!isLand(c, r - 1)) { R(ctx, x, y, sw, 2, landFill); R(ctx, x - 2, y - 2, sw + 4, 2, sandFill); }
        if (!isLand(c, r + 1)) R(ctx, x - 2, y + sh, sw + 4, 3, sandFill);
        if (!isLand(c - 1, r)) R(ctx, x - 2, y, 2, sh, sandFill);
        if (!isLand(c + 1, r)) R(ctx, x + sw, y, 2, sh, sandFill);
        if (((c * 7 + r * 13) % 11) === 0) R(ctx, x + 2, y + Math.round(sh / 3), 3, 2, mono ? MONO_SPECK : SPECK);
        continue;
      }

      // 물: 연안 얕은 물 rim — 육지에 닿은 셀은 밝게 깔고 모래 점을 디더링 (흰 알파라 무채색 공용)
      const nearLand = isLand(c - 1, r) || isLand(c + 1, r) || isLand(c, r - 1) || isLand(c, r + 1);
      if (nearLand) {
        R(ctx, x, y, sw, sh, 'rgba(226,247,255,0.16)');
        if (at(c, r - 1)?.land) for (let i = 0; i < sw; i += 4) R(ctx, x + i + ((c + r) % 2) * 2, y, 2, 1, sandFill);
        if (at(c, r + 1)?.land) for (let i = 0; i < sw; i += 4) R(ctx, x + i + ((c + r) % 2) * 2, y + sh - 1, 2, 1, sandFill);
        if (at(c - 1, r)?.land) for (let j = 0; j < sh; j += 4) R(ctx, x, y + j + ((c + r) % 2), 1, 2, sandFill);
        if (at(c + 1, r)?.land) for (let j = 0; j < sh; j += 4) R(ctx, x + sw - 1, y + j + ((c + r) % 2), 1, 2, sandFill);
      }

      // 특화 수역 텍스처 — 구현 영역에만 존재하는 스타일이라 흑백 분기 불필요
      if (def?.style === 'deep') {
        // 홀 내벽 — 경계 안쪽 음영으로 수직 감을 강조 + 드문 발광점
        const edge = !at(c - 1, r)?.style || !at(c + 1, r)?.style || !at(c, r - 1)?.style || !at(c, r + 1)?.style;
        if (edge && at(c, r - 1)?.style === 'deep') R(ctx, x, y, sw, 2, 'rgba(2,8,24,0.45)');
        if (((c * 11 + r * 5) % 17) === 0) R(ctx, x + 3, y + Math.round(sh / 2), 1, 1, 'rgba(159,216,255,0.7)');
      } else if (def?.style === 'wreck') {
        // 녹슨 철 얼룩
        if (((c * 13 + r * 7) % 9) === 0) R(ctx, x + 2, y + Math.round(sh / 2), 3, 2, 'rgba(160,100,47,0.55)');
      } else if (def?.style === 'coral') {
        // 산호 모틀
        if (((c * 5 + r * 3) % 7) === 0) R(ctx, x + 1, y + 2, 3, 2, 'rgba(127,224,212,0.5)');
      }
    }
  }

  // 3패스 — 이동 글린트 (탑다운 패럴랙스, t 있을 때만).
  // 표류 구름 그림자(원 3겹)는 사용자 지시로 제거(2026-09-06) — 밤 연출과 겹쳐 지저분했다.
  if (t !== undefined) {
    const W = map.cols * sw, H = map.rows * sh;
    for (let i = 0; i < 26; i++) {
      const gx = (i * 137 + t * 26) % W;
      const gy = (i * 89 + t * 7) % H;
      if (Math.sin(t * 3 + i * 1.7) > 0.2) R(ctx, gx | 0, gy | 0, 2, 1, 'rgba(255,255,255,0.28)');
    }
  }

  // 4패스 — 수역 라벨 자동 배치 (label 파생 — 위치는 격자가 결정. 전체 순회라 캐시 필수)
  let anchors = LABEL_CACHE.get(map);
  if (!anchors) {
    anchors = zoneLabelAnchors(map);
    LABEL_CACHE.set(map, anchors);
  }
  for (const a of anchors) {
    label(ctx, a.text, a.x, a.y - 6, FAINT, 9);
  }
}
