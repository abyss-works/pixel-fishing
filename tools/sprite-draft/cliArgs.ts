// 스프라이트 도구 CLI 공통 인자 해석 — 대상 종류와 `--이름 값` 인자.
import { SPRITE_KINDS, SPRITE_TARGETS } from '../../src/game/content/sprites/targets';
import type { SpriteKind, SpriteTarget } from '../../src/game/content/sprites/targets';

export function targetOf(kind: string | undefined): SpriteTarget {
  if (!kind || !SPRITE_KINDS.includes(kind as SpriteKind)) {
    throw new Error(`대상 종류는 ${SPRITE_KINDS.join('|')} 중 하나여야 합니다: ${kind ?? '(없음)'}`);
  }
  return SPRITE_TARGETS[kind as SpriteKind];
}

/** `--이름 값`의 값. 플래그가 없으면 undefined, 값이 없으면 거부한다 */
export function flagValue(args: readonly string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} 값이 없습니다`);
  return v;
}

/** 쉼표로 나눈 id 목록. `required`를 주면 비어 있을 때 그 플래그 이름으로 거부한다 */
export function idList(value: string | undefined, required?: string): string[] {
  const ids = (value ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (required && ids.length === 0) throw new Error(`${required} 목록이 필요합니다`);
  return ids;
}
