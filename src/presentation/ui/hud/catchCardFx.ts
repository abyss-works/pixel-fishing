import type { RarityId } from '../../../game/rules/logic';
import type { FxPlayIntensity } from '../../../features/display/model/fxPolicy';

export interface CatchCardLayers {
  /** 네 모서리 발광과 액자 광채 */
  cornerGlow: boolean;
  /** 카드 전체 광채 */
  legendGlow: boolean;
  /** 카드 안 대각 빛줄기 */
  sweep: boolean;
  /** 돌연변이 잔광 */
  wisps: boolean;
  /** 돌연변이 이름 쉬머 */
  shimmer: boolean;
}

/**
 * 카드의 효과 레이어. 등급과 폼이 후보를 정하고 강도가 상한이 된다.
 * 지시가 없으면 확인으로 본다. 확인은 등장 움직임만 남긴다.
 */
export function catchCardLayers(rarity: RarityId, isVariant: boolean, intensity: FxPlayIntensity | null): CatchCardLayers {
  const emphasized = intensity === 'emphasis' || intensity === 'spectacle';
  const highlight = rarity === 'legendary';
  const spectacle = intensity === 'spectacle';
  return {
    cornerGlow: emphasized && (rarity === 'epic' || highlight),
    legendGlow: spectacle && highlight,
    sweep: spectacle && highlight,
    wisps: emphasized && isVariant,
    shimmer: emphasized && isVariant,
  };
}
