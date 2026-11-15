import { HATS, LOOK_PRESETS, hatById, isAchievementHat } from '../../../game/content/wardrobe';
import type { Look } from '../../../game/content/wardrobe';
import { achievementForHatId } from '../../../game/content/achievements';
import { achievementProgress } from '../../../game/rules/achievements';
import { REJECT_TEXT, canBuyHat } from '../../../game/rules/rules';
import type { GameState } from '../../../game/rules/logic';

// 옷장 창의 파생 모델 — 판정은 게임 규칙(canBuyHat)을 그대로 쓰고, 여기서는 화면이 읽을 값으로 묶는다.

/** 고른 옷이 지금 입은 옷과 다른가 — [입기]·[되돌리기] 활성 기준 */
export function clothesChanged(worn: Look, pick: { shirt: number; pants: number }): boolean {
  return worn.shirt !== pick.shirt || worn.pants !== pick.pants;
}

/** 옷 조합 이름 — 프리셋과 같으면 `<프리셋 이름> 옷`, 아니면 직접 고른 옷 */
export function outfitName(pick: { shirt: number; pants: number }): string {
  const preset = LOOK_PRESETS.find(p => p.shirt === pick.shirt && p.pants === pick.pants);
  return preset ? `${preset.name} 옷` : '직접 고른 옷';
}

/** 모자 탭 라벨의 가진 수/전체 */
export function hatCountText(game: GameState): string {
  return `${game.hats.length}/${HATS.length}`;
}

export type HatActionKind = 'wear' | 'unwear' | 'buy' | 'achievement';

export interface HatDetail {
  name: string;
  price: number;
  owned: boolean;
  worn: boolean;
  action: HatActionKind;
  /** 사기를 막는 이유 문구. 살 수 있거나 사기 버튼이 아니면 null */
  buyBlock: string | null;
  /** 업적 모자의 해금 업적과 진척. 골드 모자면 null */
  unlock: { achievementName: string; condition: string; current: number; target: number } | null;
}

/** 모자 상세 칸의 이름·가격·버튼 판정 */
export function hatDetail(game: GameState, hatId: string): HatDetail {
  const hat = hatById(hatId)!;
  const owned = game.hats.includes(hat.id);
  const worn = game.look.hat === hat.id;
  if (!owned) {
    if (isAchievementHat(hat)) {
      const ach = achievementForHatId(hat.id);
      const p = ach ? achievementProgress(game, ach.id) : { current: 0, target: 0 };
      return {
        name: hat.name, price: hat.price, owned, worn, action: 'achievement',
        buyBlock: REJECT_TEXT['achievement-hat-only'],
        unlock: ach
          ? { achievementName: ach.name, condition: ach.desc, current: p.current, target: p.target }
          : null,
      };
    }
    const check = canBuyHat(game, hat.id);
    return { name: hat.name, price: hat.price, owned, worn, action: 'buy', buyBlock: check.ok ? null : REJECT_TEXT[check.reason], unlock: null };
  }
  return { name: hat.name, price: hat.price, owned, worn, action: worn ? 'unwear' : 'wear', buyBlock: null, unlock: null };
}
