// 판매 창 모델 — 창 제목, 탭, 판매 탭의 비교 표와 요약, 어종 표 위 등급 칩, 잠긴 개체 툴팁 문안.
// 판매 창은 집의 궤짝과 항구의 어시장이 같은 구성으로 연다. 두 탭(판매, 기운 얻기)은 같은 어종 표를 쓰고, 기운 얻기 탭의 모델은 기운 얻기 기능 모델이 맡는다.
// 판매 대상과 합계는 가방 파생 데이터(selectSalePreview)가 정하고, 이 모듈은 그 값을 창이 비교 표로 그릴 값으로 옮긴다.
import type { BaseId } from '../../../game/content/places';
import { RARITY, RARITY_ORDER } from '../../../game/content/rarity';
import type { RarityId } from '../../../game/content/rarity';
import { achievementBonusesOf } from '../../../game/rules/achievements';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { BASE_PACKS } from '../../../game/world';
import { selectSalePreview } from './catalog';
import type { SalePreview, SaleRow } from './catalog';

export type SaleWindowTab = 'sell' | 'energy';

/** 탭 순서와 이름 */
export const SALE_TABS: readonly { key: SaleWindowTab; label: string }[] = [
  { key: 'sell', label: '판매' },
  { key: 'energy', label: '기운 얻기' },
];

/** 창 제목 — 그 거점의 판매 시설 이름이다(집은 궤짝, 항구는 어시장). 거점 데이터의 판매 시설에서 읽고, 판매 시설이 없는 거점이면 탭 이름을 쓴다 */
export function saleWindowTitle(base: BaseId): string {
  const card = BASE_PACKS[base].furniture.find(f => f.id === 'sell');
  return card?.windowTitle ?? SALE_TABS[0].label;
}

/** 어종 표에서 잠긴 개체의 자물쇠에 붙는 툴팁 — 전부 잠긴 행과 일부만 잠긴 행의 개체 줄이 같은 문안을 쓴다 */
export const LOCKED_PICK_TIP = '잠근 개체는 고를 수 없어요.\n잠금은 가방 탭에서 풀 수 있어요.';

/** 어종 표 위의 등급 칩 하나 — 그 등급의 선택을 일괄로 켜고 끄는 단축이다.
 *  칩이 다루는 개체는 지금은 그 등급의 선택 가능 개체 전부다(각 등급 개별 체크). 기준 이하 누적으로
 *  바꾸면 칩이 덮는 범위만 갈아 끼우면 된다. 선택 가능은 잠그지 않은 개체(sellable)가 기준이다. */
export interface GradePickChip {
  grade: RarityId;
  /** 칩에 적는 등급 낱말 */
  name: string;
  /** 칩이 켜고 끄는 개체의 uid — 잠긴 개체는 칩으로도 고를 수 없어 빠진다 */
  uids: string[];
  /** 지금 전부 켜져 있는가 — 켜져 있으면 칩을 눌러 전부 끄고, 아니면 전부 켠다 */
  allOn: boolean;
}

/** 등급 칩 스트립의 칩들 — 등급 순서로 하나씩. 선택 가능한 개체가 없는 등급도 칩은 있되 uids가 비어 누를 수 없다 */
export function gradePickChips(rows: readonly SaleRow[]): GradePickChip[] {
  return RARITY_ORDER.map(grade => {
    const mine = rows.filter(row => row.fish.rarity === grade);
    const uids = mine.flatMap(row => row.sellable.map(inst => inst.uid));
    const on = new Set(mine.flatMap(row => row.selected.map(inst => inst.uid)));
    return { grade, name: RARITY[grade].name, uids, allOn: uids.length > 0 && uids.every(uid => on.has(uid)) };
  });
}

/** 현재 값과 확정 후 값 한 쌍 */
export interface BeforeAfter { current: number; after: number }

export interface SaleTabView extends SalePreview {
  /** 판매할 개체 수 */
  count: number;
  /** 골드의 지금 값과 판매 후 값(길드 판매가 보너스가 든 합계) */
  gold: BeforeAfter;
  /** 가방 마릿수의 지금 값과 판매 후 값. 잠근 개체도 가방에 센다 */
  bag: BeforeAfter;
}

export function selectSaleTab(
  game: Pick<GameState, 'bag' | 'gold'> & Partial<Pick<GameState, 'achievementCounters'>>,
  excluded: ReadonlySet<string>,
  sellBonus: number,
): SaleTabView {
  const achSellBonus = game.achievementCounters
    ? achievementBonusesOf({ ...newState(), achievementCounters: game.achievementCounters }).sellBonus
    : 0;
  const preview = selectSalePreview(game.bag, excluded, sellBonus, achSellBonus);
  const count = preview.soldUids.length;
  return {
    ...preview, count,
    gold: { current: game.gold, after: game.gold + preview.total.value },
    bag: { current: game.bag.length, after: game.bag.length - count },
  };
}
