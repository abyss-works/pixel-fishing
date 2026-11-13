import type { ReleasedFish } from '../../../game/rules/actions';

/** 가방이 차서 캐치 결과와 함께 내보낸 개체. extracted는 가공 플랜트선이 기운으로 바꾼 개체다 */
export interface BagOverflow {
  released: readonly ReleasedFish[];
  extracted?: readonly ReleasedFish[];
}

/** 가방 초과 안내 문구. 내보낸 개체가 없으면 null */
export function bagOverflowNotice({ released, extracted = [] }: BagOverflow): string | null {
  if (extracted.length === 0) {
    if (released.length === 0) return null;
    const names = released.map(fish => fish.name).join(', ');
    return `가방이 가득 차 [${names}]을(를) 놓아줬어요. 명성은 그대로 남아요.`;
  }
  const converted = `가방이 차서 ${extracted.length}마리를 생명의 기운으로`;
  return released.length === 0
    ? `${converted} 바꿨어요.`
    : `${converted} 바꾸고 ${released.length}마리를 놓아줬어요.`;
}
