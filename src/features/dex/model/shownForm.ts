import { formDiscovered } from '../../../game/rules/logic';
import type { FormId, GameState } from '../../../game/rules/logic';

export interface ShownForm {
  form: FormId;
  /** DexDetail의 폼 순서 번호 — 0 일반, 1 돌연변이 */
  index: 0 | 1;
}

/** 어종 한 칸에 대표로 보일 폼 — 일반을 먼저 보되 돌연변이만 발견했으면 발견한 돌연변이를 보인다.
 *  가방 카드·지역 어군 정보가 이름·스프라이트·상세 창 시작 폼을 함께 이 값으로 정한다. */
export function shownFormOf(game: GameState, fishId: string): ShownForm {
  return !formDiscovered(game, fishId, 'normal') && formDiscovered(game, fishId, 'variant')
    ? { form: 'variant', index: 1 }
    : { form: 'normal', index: 0 };
}
