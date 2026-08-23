// 미니맵 인터프리터 — RegionPack을 축소 표현으로 그리고 내 위치를 점멸 표시한다.
// (구 월드맵 라벨 모드는 호출자 없는 죽은 경로라 철거 — 전체 지구 조망은 pixel/scenes/atlas.ts 소관)
import { R } from '../common.js';
import type { Ctx } from '../common.js';
import { BUILDING_SPRITES } from '../sprites/buildings.js';
import { drawLand, drawWaterFill } from '../sprites/scenery.js';
import { drawSchools } from '../sprites/overlays.js';
import type { Point, RegionPack } from '../../world/types';

export function renderWorldMap(
  ctx: Ctx, pack: RegionPack, player: Point, boat: number,
  opts: { t?: number } = {},
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 바탕 + 지형 (플랫 채움 — 필드의 테두리/모래테 장식은 생략)
  if (pack.ground.kind === 'grass') R(ctx, 0, 0, pack.w, pack.h, pack.ground.mapColor);
  else drawWaterFill(ctx, pack.ground.style, { x: 0, y: 0, w: pack.w, h: pack.h });
  for (const t of pack.terrain) {
    if (t.kind === 'water') drawWaterFill(ctx, t.style, t.rect);
    else if (t.kind === 'deck') R(ctx, t.rect.x, t.rect.y, t.rect.w, t.rect.h, '#8d6e63');
    else drawLand(ctx, t.rect);
  }
  for (const b of pack.buildings) {
    const c = BUILDING_SPRITES[b.sprite].mapColor;
    if (c) R(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, c);
  }
  // 미니맵은 축소판이라 잠금 라벨("배 N단계")을 생략한다 — 필드(drawSchools 기본값)와의 차이
  drawSchools(ctx, pack.schools, boat, opts.t ?? 0, false);

  // 미니맵 모드 — 점멸 점
  const blink = (Math.sin((opts.t ?? 0) * 6) + 1) / 2 > 0.35;
  if (blink) R(ctx, player.x - 6, player.y - 6, 12, 12, '#ffffff');
}
