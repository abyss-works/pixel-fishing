// 종별 전용 격자 — 손으로 그린 스프라이트의 보관처. 키는 어종 id.
// 여기 없는 어종은 형태 격자(fishShapes.generated)로 그린다. 스프라이트 에디터
// (tools/sprite-editor/index.html)가 내보내는 객체를 그대로 붙여 넣는다.
import type { PixelSprite } from './types.js';

export const FISH_SPRITES: Readonly<Partial<Record<string, PixelSprite>>> = {};
