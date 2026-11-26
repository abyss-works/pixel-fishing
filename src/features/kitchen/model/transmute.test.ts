import { describe, expect, it } from 'vitest';
import { COOKING_UNLOCK_BOAT, ENERGY_ITEM_IDS, ENERGY_TRANSMUTE_RATIO, toStoredEnergy } from '../../../game/content/cooking';
import { itemCapOf, newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { selectTransmuteView, transmuteNoticeText } from './transmute';

const home = { kind: 'base', id: 'home' } as const;
const seed = (over: Partial<GameState> = {}): GameState => ({
  ...newState(),
  boat: COOKING_UNLOCK_BOAT,
  location: home,
  ...over,
});
const energy = (c = 0, r = 0, e = 0, l = 0): Record<string, number> => ({
  [ENERGY_ITEM_IDS.common]: toStoredEnergy(c),
  [ENERGY_ITEM_IDS.rare]: toStoredEnergy(r),
  [ENERGY_ITEM_IDS.epic]: toStoredEnergy(e),
  [ENERGY_ITEM_IDS.legendary]: toStoredEnergy(l),
});

describe('기운 변환 모델', () => {
  it('일반→희귀, 희귀→영웅, 영웅→전설 3종 정방향 카드를 만든다', () => {
    const view = selectTransmuteView(seed({ items: energy(25, 10, 5, 1) }));
    expect(view.ratio).toBe(ENERGY_TRANSMUTE_RATIO);
    expect(view.cards.map(c => [c.from, c.to])).toEqual([
      ['common', 'rare'],
      ['rare', 'epic'],
      ['epic', 'legendary'],
    ]);
    expect(view.cards[0]).toMatchObject({
      fromLabel: '생명의 기운(일반)',
      toLabel: '생명의 기운(희귀)',
      fromHaveText: '25',
      toHaveText: '10',
      pick: 'x1',
      count: 1,
      spendText: '10',
      gainText: '1',
      fromAfterText: '15',
      toAfterText: '11',
      short: false,
      capBlocked: false,
      canExecute: true,
    });
  });

  it('×10과 최대 배수 선택에 따라 소모·획득 미리보기와 실행 가능 여부를 계산한다', () => {
    const game = seed({ items: energy(125.5, 95) });
    const view = selectTransmuteView(game, { common: 'x10', rare: 'max' });

    const common = view.cards[0];
    expect(common).toMatchObject({
      pick: 'x10',
      count: 10,
      spendText: '100',
      gainText: '10',
      fromAfterText: '25.5',
      toAfterText: '105',
      canExecute: true,
    });

    const rare = view.cards[1];
    expect(rare).toMatchObject({
      pick: 'max',
      count: 9,
      spendText: '90',
      gainText: '9',
      fromAfterText: '5',
      toAfterText: '9',
      canExecute: true,
    });
  });

  it('보유 기운이 부족하면 ×10 선택 시 short와 규칙 거부 사유를 낸다', () => {
    const view = selectTransmuteView(seed({ items: energy(35) }), { common: 'x10' });
    const common = view.cards[0];
    expect(common.short).toBe(true);
    expect(common.canExecute).toBe(false);
    expect(common.check).toEqual({ ok: false, reason: 'not-enough-energy' });
  });

  it('최대 선택 시 변환 가능 횟수가 0이면 소모·획득 0과 규칙 거부 사유를 낸다', () => {
    const low = selectTransmuteView(seed({ items: energy(9) }), { common: 'max' });
    expect(low.cards[0]).toMatchObject({
      count: 0,
      spendText: '0',
      gainText: '0',
      fromAfterText: '9',
      toAfterText: '0',
      canExecute: false,
      check: { ok: false, reason: 'not-enough-energy' },
    });

    const capped = selectTransmuteView(
      seed({ items: { [ENERGY_ITEM_IDS.common]: toStoredEnergy(100), [ENERGY_ITEM_IDS.rare]: itemCapOf(ENERGY_ITEM_IDS.rare) } }),
      { common: 'max' },
    );
    expect(capped.cards[0]).toMatchObject({
      count: 0,
      capBlocked: true,
      canExecute: false,
      check: { ok: false, reason: 'energy-cap' },
    });
  });

  it('집 밖이나 해금 전이면 규칙 거부 사유를 전한다', () => {
    const outside = selectTransmuteView(seed({ location: { kind: 'region', id: 'village' }, items: energy(20) }));
    expect(outside.cards[0].canExecute).toBe(false);
    expect(outside.cards[0].check).toEqual({ ok: false, reason: 'not-at-home' });

    const locked = selectTransmuteView(seed({ boat: COOKING_UNLOCK_BOAT - 1, items: energy(20) }));
    expect(locked.cards[0].canExecute).toBe(false);
    expect(locked.cards[0].check).toEqual({ ok: false, reason: 'cooking-locked' });
  });

  it('변환 완료 안내 문구를 만든다', () => {
    const view = selectTransmuteView(seed({ items: energy(20) }));
    expect(transmuteNoticeText(view.cards[0], toStoredEnergy(10), toStoredEnergy(1))).toBe(
      '생명의 기운(일반) 10개를 생명의 기운(희귀) 1개로 바꿨어요.',
    );
  });
});
