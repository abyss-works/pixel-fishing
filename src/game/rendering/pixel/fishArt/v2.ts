// v2 어댑터 — 격자 스프라이트(원화 격자 → 형태 격자 순 해석) + 윤곽 + 유영 흔들기·반전.
// 색 배열은 (어종, 폼, 발견)마다 한 번 만든다 — 매 프레임 새 배열이면 래스터 캐시 키 계산만 늘어난다.
import { fishColors, fishRings, fishSprite } from '../../../content/sprites/index.js';
import type { FormId } from '../../../content/fish.js';
import { drawSpriteCentered } from '../sprite.js';
import type { FishArt, FishArtSubject } from './port.js';

const COLOR_CACHE = new Map<string, string[]>();
function colorsOf(fish: FishArtSubject, form: FormId, discovered: boolean): string[] {
  const key = `${fish.id}|${form}|${discovered ? 1 : 0}`;
  let c = COLOR_CACHE.get(key);
  if (!c) {
    c = fishColors(fish, form, discovered);
    COLOR_CACHE.set(key, c);
  }
  return c;
}

export const fishArtV2: FishArt = {
  style: 'v2',
  motion: true,
  drawCentered(ctx, fish, cx, cy, { scale, form = 'normal', discovered = true, flip, t }) {
    drawSpriteCentered(ctx, fishSprite(fish, form), colorsOf(fish, form, discovered), scale, cx, cy,
      { ...fishRings(fish, discovered), flip, t });
  },
};
