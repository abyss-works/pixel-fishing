// 기운 변환 탭 모델 — 하위 기운 10개를 한 단계 위 기운 1개로 바꾸는 정방향 10:1 카드 상태와 미리보기.
// 변환 가능 여부는 게임 규칙(canTransmuteEnergy)이 정하고, 이 모듈은 표현 계층이 game/ 값을 직접 import하지 않게 문자열 포맷까지 완결한다.
import {
  ENERGY_ITEM_IDS, ENERGY_TRANSMUTE_RATIO, ENERGY_TRANSMUTE_STEPS, ENERGY_UNIT, formatEnergy,
} from '../../../game/content/cooking';
import type { RarityId } from '../../../game/content/rarity';
import { canTransmuteEnergy } from '../../../game/rules/cooking';
import { itemCapOf } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import type { RuleCheck } from '../../../game/rules/rules';
import { energyLabel } from './energy';

export type TransmutePick = 'x1' | 'x10' | 'max';

export const TRANSMUTE_PICKS: readonly { key: TransmutePick; label: string }[] = [
  { key: 'x1', label: '×1' },
  { key: 'x10', label: '×10' },
  { key: 'max', label: '최대' },
];

export const TRANSMUTE_NOTICE =
  `하위 생명의 기운 ${ENERGY_TRANSMUTE_RATIO}개를 한 단계 위 생명의 기운 1개로 바꿔요. 상위 기운을 하위로 되돌릴 수는 없어요.`;

export interface TransmuteCardView {
  from: RarityId;
  to: RarityId;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  fromHave: number;
  toHave: number;
  fromHaveText: string;
  toHaveText: string;
  pick: TransmutePick;
  count: number;
  maxCount: number;
  spend: number;
  gain: number;
  spendText: string;
  gainText: string;
  fromAfterText: string;
  toAfterText: string;
  short: boolean;
  capBlocked: boolean;
  canExecute: boolean;
  check: RuleCheck;
}

export interface TransmuteView {
  ratio: number;
  cards: TransmuteCardView[];
}

export function selectTransmuteView(
  game: GameState,
  selections: Partial<Record<RarityId, TransmutePick>> = {},
): TransmuteView {
  const cards = ENERGY_TRANSMUTE_STEPS.map(({ from, to }): TransmuteCardView => {
    const fromId = ENERGY_ITEM_IDS[from];
    const toId = ENERGY_ITEM_IDS[to];
    const fromHave = game.items[fromId] ?? 0;
    const toHave = game.items[toId] ?? 0;
    const stepCost = ENERGY_TRANSMUTE_RATIO * ENERGY_UNIT;
    const maxBySource = Math.floor(fromHave / stepCost);
    const maxByCap = Math.max(0, Math.floor((itemCapOf(toId) - toHave) / ENERGY_UNIT));
    const maxCount = Math.min(maxBySource, maxByCap);

    const pick = selections[from] ?? 'x1';
    const count = pick === 'x1' ? 1 : pick === 'x10' ? 10 : maxCount;
    const spend = count * stepCost;
    const gain = count * ENERGY_UNIT;

    const check = canTransmuteEnergy(game, from, Math.max(1, count));
    const short = count > 0 ? fromHave < spend : fromHave < stepCost;
    const capBlocked = count > 0
      ? toHave + gain > itemCapOf(toId)
      : toHave + ENERGY_UNIT > itemCapOf(toId);

    return {
      from,
      to,
      fromId,
      toId,
      fromLabel: energyLabel(from),
      toLabel: energyLabel(to),
      fromHave,
      toHave,
      fromHaveText: formatEnergy(fromHave),
      toHaveText: formatEnergy(toHave),
      pick,
      count,
      maxCount,
      spend,
      gain,
      spendText: formatEnergy(spend),
      gainText: formatEnergy(gain),
      fromAfterText: formatEnergy(Math.max(0, fromHave - spend)),
      toAfterText: formatEnergy(toHave + gain),
      short,
      capBlocked,
      canExecute: count > 0 && check.ok,
      check,
    };
  });

  return { ratio: ENERGY_TRANSMUTE_RATIO, cards };
}

export function transmuteNoticeText(card: Pick<TransmuteCardView, 'fromLabel' | 'toLabel'>, spent: number, gained: number): string {
  return `${card.fromLabel} ${formatEnergy(spent)}개를 ${card.toLabel} ${formatEnergy(gained)}개로 바꿨어요.`;
}
