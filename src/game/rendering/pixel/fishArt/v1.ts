// v1 어댑터 — 스프라이트화 직전 그림체. 어종 형태(shape) + 폼 색 한 가지로 절차 렌더러가 그린다.
// 스냅샷이라 움직임 연출과 윤곽을 지원하지 않는다(flip·t는 무시).
import { SILHOUETTE } from '../../../content/sprites/index.js';
import { drawFishSprite } from './v1Shapes.js';
import type { FishArt } from './port.js';

export const fishArtV1: FishArt = {
  style: 'v1',
  motion: false,
  drawCentered(ctx, fish, cx, cy, { scale, form = 'normal', discovered = true }) {
    const color = discovered ? (form === 'variant' ? fish.variant.color : fish.color) : SILHOUETTE;
    drawFishSprite(ctx, cx, cy, fish.shape, color, scale, discovered);
  },
};
