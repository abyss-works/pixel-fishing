// v1 어댑터 — 스프라이트화 직전 그림체. 어종 형태(shape) + 폼 색 한 가지로 절차 렌더러가 그린다.
// 스냅샷이라 유영 흔들기(t)와 윤곽을 지원하지 않는다(flip만 반영).
import { SILHOUETTE } from '../../../content/sprites/common.js';
import { drawFishSprite } from './v1Shapes.js';
import type { FishArt } from './port.js';

export const fishArtV1: FishArt = {
  style: 'v1',
  motion: false,
  drawCentered(ctx, fish, cx, cy, { scale, form = 'normal', discovered = true, flip = false }) {
    const color = discovered ? (form === 'variant' ? fish.variant.color : fish.color) : SILHOUETTE;
    drawFishSprite(ctx, cx, cy, fish.shape, color, scale, discovered, flip);
  },
};
