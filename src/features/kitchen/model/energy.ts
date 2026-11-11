// 기운 얻기 탭 모델 — 체크 기본값, 해역별 켜짐과 꺼짐, 고를 개체와 얻는 기운을 정한다.
// 체크 기본값과 확정 가능 여부는 게임 규칙(energyTargetOf, canExtractEnergy)이 정하고, 이 모듈은 그 판정을 화면용 행으로 옮긴다.
// 개체를 직접 고른 값(EnergyPicks)은 해역 기본값 위에 얹힌다. 화면이 들고 있는 선택 상태의 형식과 갱신 규칙이 여기 있다.
import { RARITY, RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { SPOTS } from '../../../game/content/spots';
import type { SpotId } from '../../../game/content/spots';
import { energyDefaultExcluded, energyGain, energyTargetOf, canExtractEnergy } from '../../../game/rules/cooking';
import { instanceFish } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';
import { gradeName } from '../../../shared/lib/gradeName';
import { selectSalePreview } from '../../inventory/model/catalog';
import type { SaleRow } from '../../inventory/model/catalog';

/** 생명의 기운의 화면 이름 — 등급은 이름 뒤 괄호로 붙인다 */
export const ENERGY_NAME = '생명의 기운';

/** 그 등급 기운의 화면 이름 — 이름 뒤 괄호에 등급을 붙인다 */
export const energyLabel = (grade: RarityId): string => gradeName(ENERGY_NAME, RARITY[grade].name);

/** 개체를 직접 고른 값 — uid별 체크 여부. 없는 개체는 그 어종 해역의 기본값을 따른다 */
export type EnergyPicks = Readonly<Record<string, boolean>>;

/** 해역 칩 한 줄 */
export interface EnergySpotRow {
  id: SpotId;
  name: string;
  /** 지금 켜짐 여부 — 덮어쓴 값이 있으면 그 값, 없으면 기본값 */
  on: boolean;
  /** 덮어쓰지 않았을 때의 값 */
  defaultOn: boolean;
  overridden: boolean;
}

export interface EnergyView {
  /** 판매 창과 같은 어종 행 */
  rows: SaleRow[];
  /** 기운으로 바꿀 개체 uid */
  uids: string[];
  /** 등급별로 얻는 기운 개수 */
  byGrade: Record<RarityId, number>;
  total: number;
  /** 잠겨서 기운 얻기에서 빠지는 개체 수 */
  lockedCount: number;
  /** 배로 갈 수 있는 해역, 가장 앞선 해역부터 */
  spots: EnergySpotRow[];
  /** 덮어쓴 해역이 하나라도 있는가 */
  hasOverride: boolean;
  /** 확정 가능 여부 — 게임 규칙의 판정 그대로 */
  allowed: RuleCheck;
}

const isChecked = (game: GameState, picks: EnergyPicks, inst: FishInstance): boolean => {
  const picked = Object.hasOwn(picks, inst.uid) ? picks[inst.uid] : undefined;
  if (picked !== undefined) return picked;
  const fish = instanceFish(inst);
  return fish !== undefined && energyTargetOf(game, fish.spot);
};

export function selectEnergyView(game: GameState, picks: EnergyPicks): EnergyView {
  const excluded = new Set(game.bag.filter(i => !isChecked(game, picks, i)).map(i => i.uid));
  const { rows, soldUids, lockedCount } = selectSalePreview(game.bag, excluded, 0);
  const gain = energyGain(game, soldUids);
  const defaultOff = energyDefaultExcluded(game.boat) as string[];
  const spots = SPOTS.filter(s => s.boatTier <= game.boat).reverse().map((s): EnergySpotRow => ({
    id: s.id, name: s.name,
    on: energyTargetOf(game, s.id),
    defaultOn: !defaultOff.includes(s.id),
    overridden: Object.hasOwn(game.energyTargets, s.id),
  }));
  return {
    rows, uids: gain.uids, byGrade: gain.byGrade,
    total: gain.uids.length, lockedCount, spots,
    hasOverride: spots.some(s => s.overridden),
    allowed: canExtractEnergy(game),
  };
}

/** 지정한 개체를 모두 같은 값으로 고른다 */
export const pickEnergyUids = (picks: EnergyPicks, uids: readonly string[], on: boolean): EnergyPicks => ({
  ...picks, ...Object.fromEntries(uids.map(uid => [uid, on])),
});

/** 그 해역 어종 개체의 직접 선택을 지운다 — 해역 켜짐 여부를 바꾸면 그 해역 행만 새 기본값을 따르고 다른 해역은 고른 대로 남는다 */
export function clearSpotPicks(picks: EnergyPicks, bag: readonly FishInstance[], spot: SpotId): EnergyPicks {
  const gone = new Set(bag.filter(i => instanceFish(i)?.spot === spot).map(i => i.uid));
  return Object.fromEntries(Object.entries(picks).filter(([uid]) => !gone.has(uid)));
}

/** 결과 한 줄 — 얻은 등급만 등급 순서로 */
export function energyResultRows(byGrade: Record<RarityId, number>): { grade: RarityId; count: number }[] {
  return RARITY_ORDER.filter(g => byGrade[g] > 0).map(grade => ({ grade, count: byGrade[grade] }));
}
