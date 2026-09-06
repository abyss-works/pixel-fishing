// 세계지도(atlas) 렌더러 — 전지구 마스크(earth.mask)를 통째로 그리고, 구현 영역만 컬러로
// 비춘다. 지구는 아직 만들지 않은 바다가 대부분이라는 걸 보여주는 화면(사용자 확정 2026-08-28):
// 흑백 = 미개척, 컬러 = 지금 항해할 수 있는 세계.
//
// ⚠️ 이 모듈은 **동적 import 전용**이다 — earth 마스크(~178KB)가 들어있어 pixel/index 배럴에
// 재수출하면 초기 번들에 녹아든다. WorldMapModal이 첫 오픈 시 import()한다.
//
// 구현 영역 판정은 world.json의 window와 **같은 래스터라이즈 계약**(earth.json이 world.json을
// extends — 구역 문자가 earth 마스크에도 찍힌다)이라, 여기서 하는 일은 좌표 변환과 톤 분기뿐이다.
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { compileMap, zoneLabelAnchors } from '../../world/mask';
import { drawMaskTerrain } from '../sprites/mask.js';
import type { CompiledMap, Point, Rect } from '../../world/types';
import { WORLD_LEGEND } from '../../world/regions/world';
import { WINDOW as EARTH_WINDOW, COLS as E_COLS, ROWS as E_ROWS, CELL_W as E_CW, CELL_H as E_CH,
  MASK_ROWS as EARTH_MASK_ROWS } from '../../world/regions/generated/earth.mask';
import { WINDOW as WORLD_WINDOW, COLS as W_COLS, ROWS as W_ROWS, CELL_W as W_CW, CELL_H as W_CH,
  ANCHORS as WORLD_ANCHORS } from '../../world/regions/generated/world.mask';

const EARTH_W = E_COLS * E_CW, EARTH_H = E_ROWS * E_CH;
const WORLD_W = W_COLS * W_CW, WORLD_H = W_ROWS * W_CH;

/** 전지구 컴파일 마스크 — world와 같은 legend(문자 체계를 extends로 상속받았다) */
export const EARTH_MAP: CompiledMap = compileMap(E_CW, E_CH, WORLD_LEGEND, EARTH_MASK_ROWS);

// 화면 크기 — 지구(5760×2717)를 폭 1280에 맞춘다(세계지도 2배 확대 — 사용자 지시 2026-08-28).
// 배면만 커지고 모달 표시 폭은 .pf-modal-worldmap(index.css, 레이어 밖)이 min(1280px, 96vw)로
// 벌린다 — 1:1 픽셀 대응 화면에서 pixelated가 선명하다. Modal이 이 크기를 안다.
export const ATLAS_W = 1280;
export const ATLAS_H = Math.round(ATLAS_W * EARTH_H / EARTH_W);

/** world 팩 좌표 → earth 지도 px (두 마스크가 같은 래스터라이즈 규약이라 경위도가 다리다 —
 *  변환은 모두 선형). */
export function worldToEarth(x: number, y: number): Point {
  const lon = WORLD_WINDOW.lonMin + x / WORLD_W * (WORLD_WINDOW.lonMax - WORLD_WINDOW.lonMin);
  const lat = WORLD_WINDOW.latMax - y / WORLD_H * (WORLD_WINDOW.latMax - WORLD_WINDOW.latMin);
  return {
    x: (lon - EARTH_WINDOW.lonMin) / (EARTH_WINDOW.lonMax - EARTH_WINDOW.lonMin) * EARTH_W,
    y: (EARTH_WINDOW.latMax - lat) / (EARTH_WINDOW.latMax - EARTH_WINDOW.latMin) * EARTH_H,
  };
}

/** 구현 영역(구 world.json window)의 earth px 사각형 — 컬러/흑백 경계의 단일 근원 */
export function implementedRect(): Rect {
  const a = worldToEarth(0, 0);
  const b = worldToEarth(WORLD_W, WORLD_H);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const HARBORS: { name: string; anchor: { x: number; y: number } }[] = [
  { name: '항구', anchor: WORLD_ANCHORS.harbor },
  { name: '마닐라항', anchor: WORLD_ANCHORS.manila },
  { name: '콜롬보 항', anchor: WORLD_ANCHORS.colombo },
];

/** 지구 전체 1회 렌더 — 호출자가 오프스크린 캔버스에 캐시한다(모달 열림당 1회).
 *  밝은 구역 = 구현 영역(지금 항해 가능), 흑백 = 아직 만들지 않은 세계. */
export function renderAtlasBase(ctx: Ctx, earth: CompiledMap): void {
  const s = ctx.canvas.width / EARTH_W;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#0a1524';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawMaskTerrain(ctx, earth, false, undefined, undefined, implementedRect());
}

/** 동적 레이어 — 경계선·구역 라벨·항구·점멸 점 (프레임마다, base 위에 얹는다).
 *  player는 world 팩 좌표(마을이면 null — 마을 좌표는 경위도가 없다). */
export function renderAtlasOverlay(
  ctx: Ctx, worldMap: CompiledMap, player: Point | null, t: number,
): void {
  const s = ctx.canvas.width / EARTH_W;
  const toDisplay = (p: Point): Point => {
    const e = worldToEarth(p.x, p.y);
    return { x: e.x * s, y: e.y * s };
  };

  // 구현 영역 경계선 — "지금의 세계"가 지구에서 차지하는 자리
  const win = implementedRect();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = 'rgba(255,213,79,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(win.x * s + 0.5, win.y * s + 0.5, win.w * s - 1, win.h * s - 1);

  // 구역 라벨 — world 마스크의 라벨 문자 앵커(태평양/동남아&오세아니아/인도양)를 표시 스케일로
  ctx.textAlign = 'center';
  for (const a of zoneLabelAnchors(worldMap)) {
    const d = toDisplay(a);
    label(ctx, a.text, d.x, d.y, UI.gold, 9);
  }

  // 항구 마커 — 접안 가능한 세 곳
  for (const h of HARBORS) {
    const d = toDisplay(h.anchor);
    R(ctx, d.x - 1.5, d.y - 1.5, 3, 3, UI.gold);
    label(ctx, h.name, d.x, d.y + 9, UI.dim, 8);
  }

  // 점멸 점 — 지금 서 있는 곳 (마을은 경위도가 없어 표시하지 않는다 — 항구 점이 고향을 가리킨다)
  const blink = (Math.sin(t * 6) + 1) / 2 > 0.35;
  if (player && blink) {
    const d = toDisplay(player);
    R(ctx, d.x - 2, d.y - 2, 4, 4, '#ffffff');
  }
}
