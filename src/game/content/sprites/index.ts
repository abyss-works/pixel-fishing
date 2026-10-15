// 어종 → 스프라이트·팔레트·링 해석 (DOM 비의존).
// 해석 순서: 손 수정 격자(fishSprites) → 원화 격자(fishSprites.generated, 폼별 키) →
// 폼 격자가 없으면 일반 격자 → 형태 격자(fishShapes.generated, 신규 어종 초안용).
// 원화 격자는 팔레트가 고정 hex라 기준색을 쓰지 않는다. 미발견은 전 슬롯을 실루엣 색으로 치환한다 —
// 실루엣이 같은 데이터에서 파생된다는 계약(R3·R19).
import type { Fish, FormId } from '../fish.js';
import { FISH_SHAPE_SPRITES } from './fishShapes.generated.js';
import { FISH_SPRITES_GENERATED } from './fishSprites.generated.js';
import { FISH_SPRITES } from './fishSprites.js';
import { paletteColors } from './types.js';
import type { PixelSprite } from './types.js';

/** 미발견 실루엣 색 — 몸 형태만 보여주고 색은 숨긴다 (도감 스포일러 규칙) */
export const SILHOUETTE = '#22314a';
/** 윤곽 — 어두운 수면·패널 위에서 몸을 떼어 놓는 가독성용. 순검정보다 한 단계 연한 남색 */
export const OUTLINE_DARK = '#182540';

export const spriteKey = (id: string, form: FormId): string => (form === 'variant' ? `${id}.variant` : id);

export function fishSprite(fish: Pick<Fish, 'id' | 'shape'>, form: FormId = 'normal'): PixelSprite {
  const key = spriteKey(fish.id, form);
  return FISH_SPRITES[key] ?? FISH_SPRITES_GENERATED[key]
    ?? FISH_SPRITES[fish.id] ?? FISH_SPRITES_GENERATED[fish.id]
    ?? FISH_SHAPE_SPRITES[fish.shape];
}

/** 폼·발견 여부에 따른 실제 색 배열 — 렌더러는 이 배열로 래스터 캐시 키를 만든다 */
export function fishColors(
  fish: Pick<Fish, 'id' | 'shape' | 'color' | 'variant'>, form: FormId = 'normal', discovered = true,
): string[] {
  const sprite = fishSprite(fish, form);
  if (!discovered) return sprite.palette.map(() => SILHOUETTE);
  return paletteColors(sprite.palette, form === 'variant' ? fish.variant.color : fish.color);
}

export interface FishRings { outline?: string }

/** 몸 둘레 링 — 발견한 개체는 어두운 윤곽 한 칸, 미발견은 링 없음(실루엣만).
 *  등급은 스프라이트가 아니라 카드 테두리·등급 점·텍스트가 말한다(등급색 오라는 과해서 뺐다). */
export function fishRings(_fish: Pick<Fish, 'rarity'>, discovered = true): FishRings {
  return discovered ? { outline: OUTLINE_DARK } : {};
}

export { FISH_SHAPE_SPRITES } from './fishShapes.generated.js';
export { FISH_SPRITES_GENERATED } from './fishSprites.generated.js';
export { FISH_SPRITES } from './fishSprites.js';
export type { PixelSprite, PaletteSlot } from './types.js';
export { cellIndex, paletteColors, TRANSPARENT } from './types.js';
