// 종별 수정 격자 — 생성 파일(fishSprites.generated)보다 먼저 해석되는 손 수정 보관처.
// 키는 "<어종 id>" 또는 "<어종 id>.variant". 스프라이트 에디터(tools/sprite-editor/index.html)가
// 내보내는 객체를 그대로 붙여 넣는다. 원화 PNG를 고쳐 다시 가져오는 쪽이 정석이고, 여기는
// 원화 없이 격자만 손본 경우를 위한 자리다.
import type { PixelSprite } from './types.js';

export const FISH_SPRITES: Readonly<Partial<Record<string, PixelSprite>>> = {};
