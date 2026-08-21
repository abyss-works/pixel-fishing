// 월드맵/미니맵 인터프리터 — RegionPack을 월드 1:1 해상도의 축소 표현으로 그린다.
// labels=true(월드맵): 지명·범례·내 위치 십자 / labels=false(미니맵): 점멸 점만.
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { BUILDING_SPRITES } from '../sprites/buildings.js';
import { drawLabel, drawLand, drawWaterFill } from '../sprites/scenery.js';
import { drawSchools } from '../sprites/overlays.js';
import type { Point, RegionPack } from '../../world/types';

export function renderWorldMap(
  ctx: Ctx, pack: RegionPack, player: Point, boat: number,
  opts: { labels?: boolean; t?: number } = {},
) {
  const labels = opts.labels ?? true;
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

  if (labels) for (const l of pack.mapLabels) drawLabel(ctx, l, true);
  drawSchools(ctx, pack.schools, boat, opts.t ?? 0, labels);

  if (labels) {
    // 내 위치 — 십자 마커
    R(ctx, player.x - 3, player.y - 3, 6, 6, '#ffffff');
    R(ctx, player.x - 6, player.y - 6, 12, 1, 'rgba(255,255,255,0.6)');
    R(ctx, player.x - 6, player.y + 5, 12, 1, 'rgba(255,255,255,0.6)');
    R(ctx, player.x - 6, player.y - 6, 1, 12, 'rgba(255,255,255,0.6)');
    R(ctx, player.x + 5, player.y - 6, 1, 12, 'rgba(255,255,255,0.6)');
    label(ctx, '내 위치', player.x, player.y - 10, UI.text, 11);
  } else {
    // 미니맵 모드 — 점멸 점
    const blink = (Math.sin((opts.t ?? 0) * 6) + 1) / 2 > 0.35;
    if (blink) R(ctx, player.x - 6, player.y - 6, 12, 12, '#ffffff');
  }
}
