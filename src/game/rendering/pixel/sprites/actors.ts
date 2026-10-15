// 배우 스프라이트 — 플레이어(도보)/배(항해). 자기 좌표계만 알고 상태를 모른다 (계층: 단위 스프라이트)
import { R } from '../common.js';
import type { Ctx } from '../common.js';
import { drawSprite } from '../sprite.js';
import { BOAT_PALETTE, BOAT_SPRITES, BOAT_WATERLINE } from '../../../content/sprites/boatSprites.generated.js';
import { OUTLINE_DARK } from '../../../content/sprites/index.js';

export function drawPerson(ctx: Ctx, x: number, y: number) {
  R(ctx, x - 3, y - 16, 6, 6, '#ffcc99');
  R(ctx, x - 4, y - 18, 8, 3, '#8d6e63');
  R(ctx, x - 2, y - 19, 4, 2, '#8d6e63');
  R(ctx, x - 3, y - 10, 6, 7, '#3f6d4e');
  R(ctx, x - 2, y - 3, 4, 3, '#31427a');
}

/** 배 — 단계별 격자 스프라이트. (x, y)는 수면 위 플레이어 좌표, 흘수선을 y에 맞춘다. 사람은 갑판 위 */
export function drawBoat(ctx: Ctx, x: number, y: number, t: number, tier: number) {
  const rock = Math.round(Math.sin(t * 2.2));
  const sprite = BOAT_SPRITES[tier] ?? BOAT_SPRITES[1];
  drawSprite(ctx, sprite, BOAT_PALETTE, 1, x - sprite.w / 2, y - BOAT_WATERLINE + rock, { outline: OUTLINE_DARK });
  drawPerson(ctx, x, y - 1 + rock);
}
