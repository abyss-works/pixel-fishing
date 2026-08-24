// 마스크 지형 페인터 — CompiledMap 격자를 픽셀 지형으로 찍는다 (작성은 ASCII, 결과는 픽셀).
// 셀은 비등방(sw×sh) — 세로 배율은 map.cellH가 결정하고 여기는 반영만 한다.
// 연출: 바다 수직 그라데이션(북 밝음→남 어둠) · 연안 얕은 물 rim · 해안 모래 디더링 ·
// 특화 수역 내부 텍스처(홀 내벽 음영·녹 얼룩·산호 모틀) · 수역 라벨 자동 배치(label 파생).
import { R, label } from '../common.js';
import type { Ctx } from '../common.js';
import { WATER_STYLE } from '../styles.js';
import type { CompiledMap, MapCellDef } from '../../world/types';
import { zoneLabelAnchors } from '../../world/mask';

const LAND = '#74c69d', LAND_HI = '#8fd6b0', SAND = '#e9c46a', SPECK = '#2d6a4f';
const FAINT = 'rgba(242,247,251,0.5)';

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

export function drawMaskTerrain(ctx: Ctx, map: CompiledMap, detail: boolean, t?: number) {
  const sw = map.cellW, sh = map.cellH;
  const at = (c: number, r: number): MapCellDef | undefined =>
    c >= 0 && r >= 0 && c < map.cols && r < map.rows ? map.palette[map.codes[r * map.cols + c]] : undefined;
  const isLand = (c: number, r: number): boolean => !!at(c, r)?.land;

  // 1패스 — 셀 채움 (가로 런 병합 + 행 비례 수심 그라데이션: 북=밝은 수면 → 남=깊은 바다)
  for (let r = 0; r < map.rows; r++) {
    const depth = map.rows > 1 ? r / (map.rows - 1) : 0;
    let start = 0;
    for (let c = 1; c <= map.cols; c++) {
      const a = map.codes[r * map.cols + c - 1];
      const b = c < map.cols ? map.codes[r * map.cols + c] : -1;
      if (b === a) continue;
      const def = map.palette[a];
      let color: string;
      if (def?.land) color = LAND;
      else {
        const st = (def?.style ?? 'sea') as keyof typeof WATER_STYLE;
        const tone = seaTones(st);
        color = mix(tone.top, tone.bot, depth);
      }
      R(ctx, start * sw, r * sh, (c - start) * sw, sh, color);
      start = c;
    }
  }

  if (!detail) return; // 미니맵 — 평면 채움만

  // 2패스 — 해안·수역 장식
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const def = at(c, r);
      const x = c * sw, y = r * sh;

      if (def?.land) {
        // 육지: 물 접촉변 모래테 + 북변 하이라이트 + 스펙클
        if (!isLand(c, r - 1)) { R(ctx, x, y, sw, 2, LAND_HI); R(ctx, x - 2, y - 2, sw + 4, 2, SAND); }
        if (!isLand(c, r + 1)) R(ctx, x - 2, y + sh, sw + 4, 3, SAND);
        if (!isLand(c - 1, r)) R(ctx, x - 2, y, 2, sh, SAND);
        if (!isLand(c + 1, r)) R(ctx, x + sw, y, 2, sh, SAND);
        if (((c * 7 + r * 13) % 11) === 0) R(ctx, x + 2, y + Math.round(sh / 3), 3, 2, SPECK);
        continue;
      }

      // 물: 연안 얕은 물 rim — 육지에 닿은 셀은 밝게 깔고 모래 점을 디더링
      const nearLand = isLand(c - 1, r) || isLand(c + 1, r) || isLand(c, r - 1) || isLand(c, r + 1);
      if (nearLand) {
        R(ctx, x, y, sw, sh, 'rgba(226,247,255,0.16)');
        if (at(c, r - 1)?.land) for (let i = 0; i < sw; i += 4) R(ctx, x + i + ((c + r) % 2) * 2, y, 2, 1, SAND);
        if (at(c, r + 1)?.land) for (let i = 0; i < sw; i += 4) R(ctx, x + i + ((c + r) % 2) * 2, y + sh - 1, 2, 1, SAND);
        if (at(c - 1, r)?.land) for (let j = 0; j < sh; j += 4) R(ctx, x, y + j + ((c + r) % 2), 1, 2, SAND);
        if (at(c + 1, r)?.land) for (let j = 0; j < sh; j += 4) R(ctx, x + sw - 1, y + j + ((c + r) % 2), 1, 2, SAND);
      }

      // 특화 수역 텍스처
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

  // 3패스 — 표류 구름 그림자 + 이동 글린트 (탑다운 패럴랙스, t 있을 때만)
  if (t !== undefined) {
    const W = map.cols * sw, H = map.rows * sh;
    for (let i = 0; i < 3; i++) {
      const cx = ((t * (9 + i * 4) + i * 640) % (W + 240)) - 120;
      const cy = H * (0.18 + i * 0.28) + Math.sin(t * 0.07 + i * 2) * 36;
      const rad = 52 + i * 16;
      for (let k = 3; k >= 1; k--) {
        ctx.fillStyle = `rgba(6,12,24,${(0.05 * (4 - k)) / 3})`;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * (k / 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 26; i++) {
      const gx = (i * 137 + t * 26) % W;
      const gy = (i * 89 + t * 7) % H;
      if (Math.sin(t * 3 + i * 1.7) > 0.2) R(ctx, gx | 0, gy | 0, 2, 1, 'rgba(255,255,255,0.28)');
    }
  }

  // 4패스 — 수역 라벨 자동 배치 (label 파생 — 위치는 격자가 결정)
  for (const a of zoneLabelAnchors(map)) {
    label(ctx, a.text, a.x, a.y - 6, FAINT, 9);
  }
}
