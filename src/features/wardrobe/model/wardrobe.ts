import { DEFAULT_LOOK, HATS, LOOK_PRESETS, hatById, isAchievementHat, isEventHat } from '../../../game/content/wardrobe';
import type { Hat, HatSource, Look } from '../../../game/content/wardrobe';
import { achievementForHatId, namedSpoilerPlace } from '../../../game/content/achievements';
import { achievementProgress } from '../../../game/rules/achievements';
import { REJECT_TEXT, canBuyHat } from '../../../game/rules/rules';
import type { GameState } from '../../../game/rules/logic';

// 옷장 창의 파생 모델 — 판정은 게임 규칙(canBuyHat)을 그대로 쓰고, 여기서는 화면이 읽을 값으로 묶는다.

const EVENT_HAT_UNOWNED_HINT = '겨울 이벤트 기간에 접속하면 우편함으로 받을 수 있어요.';
const EVENT_HAT_OWNED_HINT = '겨울 이벤트 접속 선물';

export interface HatDisplayInfo {
  id: string;
  name: string;
  look: Look | null;
}

/** 모자 id를 이름과 머리 미리보기용 외형으로 풀어낸다. 미등록 id는 외형이 null이다 */
export function resolveHatDisplay(id: string): HatDisplayInfo {
  const hat = hatById(id);
  return {
    id,
    name: hat?.name ?? id,
    look: hat ? { ...DEFAULT_LOOK, hat: hat.id } : null,
  };
}

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

export type HatActionKind = 'wear' | 'unwear' | 'buy' | 'achievement' | 'event';

export interface HatDetail {
  name: string;
  price: number;
  source: HatSource;
  owned: boolean;
  worn: boolean;
  action: HatActionKind;
  /** 사기를 막는 이유 문구. 살 수 있거나 사기 버튼이 아니면 null */
  buyBlock: string | null;
  /** 업적 모자의 해금 업적과 진척. 골드·이벤트 모자면 null */
  unlock: { achievementName: string; condition: string; current: number; target: number } | null;
  /** 이벤트 모자의 획득 안내 문구. 골드·업적 모자면 null */
  eventHint: string | null;
}

function resolveHatUnlock(game: GameState, hat: Hat): HatDetail['unlock'] {
  const ach = achievementForHatId(hat.id);
  if (!ach) return null;
  const p = achievementProgress(game, ach.id);
  const hideNamed = Boolean(
    ach.namedId && ach.namedQuestId && !game.clearedNamed.includes(ach.namedQuestId),
  );
  const place = hideNamed && ach.namedId ? namedSpoilerPlace(ach.namedId) : null;
  return {
    achievementName: place ? `${place} 네임드 토벌 ${p.target}회` : ach.name,
    condition: place ? `${place}의 네임드를 ${p.target}회 토벌해요.` : ach.desc,
    current: p.current,
    target: p.target,
  };
}

/** 모자 상세 칸의 이름·가격·버튼 판정 */
export function hatDetail(game: GameState, hatId: string): HatDetail {
  const hat = hatById(hatId)!;
  const owned = game.hats.includes(hat.id);
  const worn = game.look.hat === hat.id;
  const unlock = isAchievementHat(hat) ? resolveHatUnlock(game, hat) : null;
  const eventHint = isEventHat(hat) ? (owned ? EVENT_HAT_OWNED_HINT : EVENT_HAT_UNOWNED_HINT) : null;
  if (!owned) {
    if (isAchievementHat(hat)) {
      return {
        name: hat.name, price: hat.price, source: hat.source, owned, worn, action: 'achievement',
        buyBlock: REJECT_TEXT['achievement-hat-only'],
        unlock,
        eventHint: null,
      };
    }
    if (isEventHat(hat)) {
      return {
        name: hat.name, price: hat.price, source: hat.source, owned, worn, action: 'event',
        buyBlock: EVENT_HAT_UNOWNED_HINT,
        unlock: null,
        eventHint,
      };
    }
    const check = canBuyHat(game, hat.id);
    return {
      name: hat.name, price: hat.price, source: hat.source, owned, worn, action: 'buy',
      buyBlock: check.ok ? null : REJECT_TEXT[check.reason], unlock: null, eventHint: null,
    };
  }
  return {
    name: hat.name, price: hat.price, source: hat.source, owned, worn,
    action: worn ? 'unwear' : 'wear', buyBlock: null, unlock, eventHint,
  };
}
