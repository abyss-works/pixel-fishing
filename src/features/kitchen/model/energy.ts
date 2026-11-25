// 판매 창의 기운 얻기 탭 모델 — 체크 기본값, 해역별 켜짐과 꺼짐, 고를 개체와 얻는 기운을 정한다.
// 체크 기본값과 확정 가능 여부는 게임 규칙(energyTargetOf, canExtractEnergy)이 정하고, 이 모듈은 그 판정을 화면용 행으로 옮긴다.
// 개체를 직접 고른 값(EnergyPicks)은 해역 기본값 위에 얹힌다. 화면이 들고 있는 선택 상태의 형식과 갱신 규칙이 여기 있다.
import { ENERGY_ITEM_IDS, formatEnergy } from '../../../game/content/cooking';
import { RARITY, RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { SPOTS } from '../../../game/content/spots';
import type { SpotId } from '../../../game/content/spots';
import { achievementBonusesOf } from '../../../game/rules/achievements';
import { energyGain, energyTargetOf, energyTargetRows, energyYield, canExtractEnergy } from '../../../game/rules/cooking';
import { REJECT_TEXT, instanceFish } from '../../../game/rules/logic';
import type { FishInstance, GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';
import { gradeName } from '../../../shared/lib/gradeName';
import { energyTabLock } from '../../display/model/menuLock';
import type { AccountLockState } from '../../display/model/menuLock';
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

/** 비교 표 한 줄 — 그 등급 기운의 지금 보유와 기운을 얻은 뒤의 수(저장 단위) */
export interface EnergyCompareRow { grade: RarityId; label: string; current: number; after: number }

export interface EnergyView {
  /** 판매 창과 같은 어종 행 */
  rows: SaleRow[];
  /** 기운으로 바꿀 개체 uid */
  uids: string[];
  /** 등급별로 얻는 기운(저장 단위) */
  byGrade: Record<RarityId, number>;
  /** 얻는 기운의 합(저장 단위) */
  energyTotal: number;
  /** 기운으로 바꿀 개체 수 */
  count: number;
  /** 등급 순서의 비교 표 — 고른 개체가 없어도 네 줄이 그대로 있다 */
  compare: EnergyCompareRow[];
  /** 배로 갈 수 있는 해역, 가장 앞선 해역부터 */
  spots: EnergySpotRow[];
  /** 덮어쓴 해역이 하나라도 있는가 */
  hasOverride: boolean;
  /** 확정 가능 여부 — 게임 규칙의 판정 그대로 */
  allowed: RuleCheck;
  /** 기운 획득량 업적 누적 보너스 비율 */
  energyYieldBonus: number;
}

const isChecked = (game: GameState, picks: EnergyPicks, inst: FishInstance): boolean => {
  const picked = Object.hasOwn(picks, inst.uid) ? picks[inst.uid] : undefined;
  if (picked !== undefined) return picked;
  const fish = instanceFish(inst);
  return fish !== undefined && energyTargetOf(game, fish.spot);
};

export function selectEnergyView(game: GameState, picks: EnergyPicks): EnergyView {
  const excluded = new Set(game.bag.filter(i => !isChecked(game, picks, i)).map(i => i.uid));
  const { rows, soldUids } = selectSalePreview(game.bag, excluded, 0);
  const energyYieldBonus = achievementBonusesOf(game).energyYield;
  const gain = energyGain(game, soldUids, energyYieldBonus);
  // 해역 목록과 켜짐, 기본값 여부는 게임 규칙(energyTargetRows)이 정한다. 가장 앞선 해역부터 보인다
  const spots = energyTargetRows(game).reverse().map((r): EnergySpotRow => ({
    id: r.spot, name: SPOTS.find(s => s.id === r.spot)!.name,
    on: r.on, defaultOn: r.isDefault ? r.on : !r.on, overridden: r.overridden,
  }));
  return {
    rows, uids: gain.uids, byGrade: gain.byGrade,
    compare: RARITY_ORDER.map((grade): EnergyCompareRow => {
      const current = game.items[ENERGY_ITEM_IDS[grade]] ?? 0;
      return { grade, label: energyLabel(grade), current, after: current + gain.byGrade[grade] };
    }),
    energyTotal: energyTotal(gain.byGrade), count: gain.uids.length, spots,
    hasOverride: spots.some(s => s.overridden),
    allowed: canExtractEnergy(game),
    energyYieldBonus,
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

/** 등급별 기운(저장 단위)의 합 */
export const energyTotal = (byGrade: Record<RarityId, number>): number =>
  RARITY_ORDER.reduce((sum, g) => sum + byGrade[g], 0);

/** 어종 행에서 고른 개체가 내는 기운(저장 단위) — 산출은 게임 규칙(energyYield)에 보너스를 반영한다 */
export const energyRowValue = (row: SaleRow, energyYieldBonus = 0): number => {
  const base = energyYield(row.selectedCount);
  if (base === 0 || energyYieldBonus === 0) return base;
  return Math.round(base * Math.max(0, 1 + energyYieldBonus));
};

/** 결과 한 줄 — 얻은 등급만 등급 순서로. count는 저장 단위다 */
export function energyResultRows(byGrade: Record<RarityId, number>): { grade: RarityId; count: number }[] {
  return RARITY_ORDER.filter(g => byGrade[g] > 0).map(grade => ({ grade, count: byGrade[grade] }));
}

export type EnergyGrade = RarityId;
export type QuickEnergyGame = GameState;

export const defaultQuickEnergyGrades = (): Set<EnergyGrade> => new Set(RARITY_ORDER);

export interface QuickEnergyChip {
  grade: RarityId;
  name: string;
  /** 그 등급의 미잠금 물고기 수 */
  fishCount: number;
  /** 칩이 켜져 있는가 */
  on: boolean;
}

export interface QuickEnergyTile {
  grade: RarityId;
  itemId: string;
  label: string;
  /** 얻을 기운(저장 단위) — 이 등급 칩이 켜져 있을 때만 양수 */
  gain: number;
  /** 지금 보유(저장 단위) */
  current: number;
  /** 획득 후(저장 단위) */
  after: number;
  gainText: string;
  currentText: string;
  afterText: string;
  /** 이 등급 칩이 켜져 있는가 */
  on: boolean;
}

export interface QuickEnergyView {
  chips: QuickEnergyChip[];
  tiles: QuickEnergyTile[];
  /** 바꿀 물고기 uid 목록(미잠금 + 켜진 등급만) */
  uids: string[];
  /** 선택된 물고기 수 */
  count: number;
  /** 가방 안의 미잠금 물고기 전체 수 */
  unlockedCount: number;
  /** 가방 안의 잠긴 물고기 수 */
  lockedCount: number;
  /** 등급별 획득 기운(저장 단위) */
  byGrade: Record<RarityId, number>;
  /** 획득 기운 합(저장 단위) */
  energyTotal: number;
  /** 확정 가능 여부 — 게임 규칙 판정 */
  allowed: RuleCheck;
  /** 확정 불가 사유 문구 — 가능하면 null */
  reason: string | null;
}

/** 가방 하단 간소화 기운 얻기 창 모델 — 등급별 미잠금 물고기만 토글해 일괄 변환한다 */
export function selectQuickEnergyView(
  game: QuickEnergyGame,
  selectedGrades: ReadonlySet<RarityId>,
): QuickEnergyView {
  const byRarity = Object.fromEntries(RARITY_ORDER.map(r => [r, [] as string[]])) as Record<RarityId, string[]>;
  let lockedCount = 0;
  for (const inst of game.bag) {
    if (inst.locked) {
      lockedCount++;
      continue;
    }
    const fish = instanceFish(inst);
    if (fish) byRarity[fish.rarity].push(inst.uid);
  }
  const unlockedCount = RARITY_ORDER.reduce((sum, r) => sum + byRarity[r].length, 0);
  const selectedUids = RARITY_ORDER.flatMap(r => (selectedGrades.has(r) ? byRarity[r] : []));
  const gain = energyGain(game, selectedUids, achievementBonusesOf(game).energyYield);

  const chips = RARITY_ORDER.map((grade): QuickEnergyChip => {
    const fishCount = byRarity[grade].length;
    return {
      grade,
      name: RARITY[grade].name,
      fishCount,
      on: fishCount > 0 && selectedGrades.has(grade),
    };
  });
  const tiles = RARITY_ORDER.map((grade): QuickEnergyTile => {
    const current = game.items[ENERGY_ITEM_IDS[grade]] ?? 0;
    const add = gain.byGrade[grade];
    const after = current + add;
    return {
      grade,
      itemId: ENERGY_ITEM_IDS[grade],
      label: energyLabel(grade),
      gain: add,
      current,
      after,
      gainText: `+${formatEnergy(add)}`,
      currentText: formatEnergy(current),
      afterText: formatEnergy(after),
      on: byRarity[grade].length > 0 && selectedGrades.has(grade),
    };
  });
  const allowed = canExtractEnergy(game);

  return {
    chips,
    tiles,
    uids: gain.uids,
    count: gain.uids.length,
    unlockedCount,
    lockedCount,
    byGrade: gain.byGrade,
    energyTotal: energyTotal(gain.byGrade),
    allowed,
    reason: allowed.ok ? null : REJECT_TEXT[allowed.reason],
  };
}

/** 기운 얻기 성공 알림 문안 및 등급별 툴팁 행 조립 */
export function buildEnergyExtractNotice(energy: Record<RarityId, number>) {
  const total = formatEnergy(energyTotal(energy));
  return {
    kind: 'facility.energyExtracted' as const,
    text: `${ENERGY_NAME} ${total}개를 얻었어요!`,
    toastText: `${ENERGY_NAME} ${total}개 획득!`,
    replaceKey: 'energy-extract',
    tip: {
      target: total,
      rows: energyResultRows(energy).map(({ grade, count }) => ({
        label: energyLabel(grade),
        value: `+${formatEnergy(count)}`,
      })),
    },
  };
}

export type BagEnergyEntry =
  | { ok: true }
  | { ok: false; lines: string[] };

/** 가방 하단 기운 얻기 진입 버튼 활성 조건 — 계정·진행 잠금 판정을 먼저 보고, 열린 뒤 위치와 배 단계는 게임 규칙 판정을 따른다 */
export function selectBagEnergyEntry(
  game: Pick<GameState, 'boat' | 'location'>,
  account: AccountLockState,
): BagEnergyEntry {
  const lock = energyTabLock(account, game.boat);
  if (lock.kind !== 'none') {
    return { ok: false, lines: lock.lines };
  }
  const check = canExtractEnergy(game, false);
  if (check.ok) return { ok: true };
  return { ok: false, lines: [REJECT_TEXT[check.reason]] };
}
