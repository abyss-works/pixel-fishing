// 미니맵 인터프리터 — RegionPack을 축소 표현으로 그리고 내 위치를 점멸 표시한다.
// (구 월드맵 라벨 모드는 호출자 없는 죽은 경로라 철거 — 전체 지구 조망은 pixel/scenes/atlas.ts 소관)
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { BUILDING_SPRITES } from '../sprites/buildings.js';
import { drawMaskTerrain } from '../sprites/mask.js';
import { drawLand, drawWaterFill } from '../sprites/scenery.js';
import { drawSchools } from '../sprites/overlays.js';
import type { Point, Rect, RegionPack } from '../../world/types';

/** 미니맵 crop 크기 — 필드 시야(448×252)의 3배 폭 감각. 16:9라 미니맵 프레임(aspect-video)에
 *  왜곡 없이 들어간다. 필드 시야 1.4× 확대(오픈월드 고도화)에 맞춰 비례 조정 — 1344px = 32px/°
 *  기준 약 42°로, 지리적으로도 구 ocean 지역 한 장(40°)과 같은 스케일이다. 팩이 더 작으면
 *  (마을 640×360) 팩 전체가 보인다 — 구 계약과 동일. */
export const MINIMAP_VIEW_W = 1344, MINIMAP_VIEW_H = 756;

/** 플레이어 중심 미니맵 시야 — 지도 경계 clamp. 팩이 시야보다 작으면 팩 전체. */
export function minimapView(pack: RegionPack, player: Point): Rect {
  const w = Math.min(MINIMAP_VIEW_W, pack.w);
  const h = Math.min(MINIMAP_VIEW_H, pack.h);
  const x = Math.max(0, Math.min(player.x - w / 2, pack.w - w));
  const y = Math.max(0, Math.min(player.y - h / 2, pack.h - h));
  return { x, y, w, h };
}

export function renderWorldMap(
  ctx: Ctx, pack: RegionPack, player: Point, boat: number,
  opts: { t?: number; view?: Rect; zoneName?: string | null } = {},
) {
  // 캔버스 배면 크기 = 팩 크기와 무관하게 호출자가 정한다(병합 바다는 축소 배면으로 메모리 절감).
  // view가 있으면 그 사각형만(현재 위치 기준 crop — 전체 지구 조망은 세계지도 모달 소관).
  const view = opts.view ?? { x: 0, y: 0, w: pack.w, h: pack.h };
  const s = ctx.canvas.width / view.w;
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  // 지도가 커질수록 pack 좌표 마커는 화면에서 쪼그라든다 — 표시 크기 보정(1/s)
  const z = 1 / s;

  // 지형 (플랫 채움 — 필드의 테두리/모래테 장식은 생략. crop 밖은 컬링으로 미순회)
  if (pack.map) {
    drawMaskTerrain(ctx, pack.map, false, undefined, view);
  } else {
    const g = pack.ground!;
    R(ctx, 0, 0, pack.w, pack.h, g.mapColor);
    for (const t of pack.terrain!) {
      if (t.kind === 'water') drawWaterFill(ctx, t.style, t.rect);
      else if (t.kind === 'deck') R(ctx, t.rect.x, t.rect.y, t.rect.w, t.rect.h, '#8d6e63');
      else drawLand(ctx, t.rect);
    }
  }
  for (const b of pack.buildings) {
    const c = BUILDING_SPRITES[b.sprite].mapColor;
    if (c) R(ctx, b.rect.x + b.rect.w / 2 - b.rect.w * z / 2,
             b.rect.y + b.rect.h / 2 - b.rect.h * z / 2, b.rect.w * z, b.rect.h * z, c);
  }
  // 미니맵은 축소판이라 잠금 라벨("배 N단계")을 생략한다 — 필드(drawSchools 기본값)와의 차이
  drawSchools(ctx, pack.schools, boat, opts.t ?? 0, false, z);

  // 점멸 점 — 표시 크기 일정 유지(zoom 보정)
  const blink = (Math.sin((opts.t ?? 0) * 6) + 1) / 2 > 0.35;
  if (blink) R(ctx, player.x - 6 * z, player.y - 6 * z, 12 * z, 12 * z, '#ffffff');

  // 현재 구역 이름 — 화면 상단 중앙(표시 스케일, pack 좌표 무관). 미니맵 전용 옵션.
  if (opts.zoneName) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    label(ctx, opts.zoneName, ctx.canvas.width / 2, 11, UI.gold, 8);
  }
}
