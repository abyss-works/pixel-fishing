// 판매 창 모델 — 창 제목, 탭, 판매 탭의 비교 표와 요약, 잠긴 개체 툴팁 문안.
// 판매 창은 집의 궤짝과 항구의 어시장이 같은 구성으로 연다. 두 탭(판매, 기운 얻기)은 같은 어종 표를 쓰고, 기운 얻기 탭의 모델은 기운 얻기 기능 모델이 맡는다.
// 판매 대상과 합계는 가방 파생 데이터(selectSalePreview)가 정하고, 이 모듈은 그 값을 창이 비교 표로 그릴 값으로 옮긴다.
import type { BaseId } from '../../../game/content/places';
import type { GameState } from '../../../game/rules/logic';
import { BASE_PACKS } from '../../../game/world';
import { selectSalePreview } from './catalog';
import type { SalePreview } from './catalog';

export type SaleWindowTab = 'sell' | 'energy';

/** 탭 순서와 이름 */
export const SALE_TABS: readonly { key: SaleWindowTab; label: string }[] = [
  { key: 'sell', label: '판매' },
  { key: 'energy', label: '기운 얻기' },
];

/** 창 제목 — 그 거점의 판매 시설 이름이다(집은 궤짝, 항구는 어시장). 시설 카드와 같은 이름을 거점 데이터에서 읽는다 */
export function saleWindowTitle(base: BaseId): string {
  const card = BASE_PACKS[base].furniture.find(f => f.id === 'sell');
  if (!card) throw new Error(`판매 시설이 없는 거점이에요: ${base}`);
  return card.label({ rod: 0, boatName: '' }).title;
}

/** 어종 표에서 잠긴 개체의 자물쇠에 붙는 툴팁 — 전부 잠긴 행과 일부만 잠긴 행의 개체 줄이 같은 문안을 쓴다 */
export const LOCKED_PICK_TIP = '잠근 개체는 고를 수 없어요.\n잠금은 가방 탭에서 풀 수 있어요.';

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

export function selectSaleTab(game: Pick<GameState, 'bag' | 'gold'>, excluded: ReadonlySet<string>, sellBonus: number): SaleTabView {
  const preview = selectSalePreview(game.bag, excluded, sellBonus);
  const count = preview.soldUids.length;
  return {
    ...preview, count,
    gold: { current: game.gold, after: game.gold + preview.total.value },
    bag: { current: game.bag.length, after: game.bag.length - count },
  };
}
