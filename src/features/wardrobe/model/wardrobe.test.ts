import { describe, it, expect } from 'vitest';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { clothesChanged, hatCountText, hatDetail, outfitName } from './wardrobe';

const seed = (over: Partial<GameState> = {}): GameState => ({ ...newState(), ...over });

describe('clothesChanged', () => {
  it('고른 웃옷과 바지가 입은 것과 같으면 바뀐 것이 없다', () => {
    expect(clothesChanged({ shirt: 1, pants: 2, hat: 'cap-red' }, { shirt: 1, pants: 2 })).toBe(false);
  });
  it('웃옷이나 바지 하나만 달라도 바뀐 것이다', () => {
    expect(clothesChanged({ shirt: 1, pants: 2, hat: null }, { shirt: 3, pants: 2 })).toBe(true);
    expect(clothesChanged({ shirt: 1, pants: 2, hat: null }, { shirt: 1, pants: 4 })).toBe(true);
  });
});

describe('outfitName', () => {
  it('프리셋과 같은 조합이면 프리셋 이름이다', () => {
    expect(outfitName({ shirt: 6, pants: 1 })).toBe('어부 옷');
    expect(outfitName({ shirt: 0, pants: 0 })).toBe('기본 옷');
  });
  it('프리셋에 없는 조합은 직접 고른 옷이다', () => {
    expect(outfitName({ shirt: 6, pants: 2 })).toBe('직접 고른 옷');
  });
});

describe('hatCountText', () => {
  it('가진 수와 전체 수를 보인다', () => {
    expect(hatCountText(seed())).toBe('0/5');
    expect(hatCountText(seed({ hats: ['cap-red', 'cap-blue'] }))).toBe('2/5');
  });
});

describe('hatDetail', () => {
  it('가진 모자를 쓰고 있지 않으면 쓰기 버튼이다', () => {
    expect(hatDetail(seed({ hats: ['cap-red'] }), 'cap-red')).toMatchObject({ owned: true, worn: false, action: 'wear' });
  });
  it('쓰고 있는 모자는 벗기 버튼이다', () => {
    const game = seed({ hats: ['cap-red'], look: { shirt: 0, pants: 0, hat: 'cap-red' } });
    expect(hatDetail(game, 'cap-red')).toMatchObject({ owned: true, worn: true, action: 'unwear' });
  });
  it('없는 모자는 사기 버튼이고 골드가 충분하면 막지 않는다', () => {
    expect(hatDetail(seed({ gold: 50_000 }), 'cap-red')).toMatchObject({ owned: false, action: 'buy', price: 50_000, buyBlock: null });
  });
  it('골드가 모자라면 사기를 막고 이유를 준다', () => {
    const d = hatDetail(seed({ gold: 49_999 }), 'cap-red');
    expect(d.action).toBe('buy');
    expect(d.buyBlock).toBe('골드가 부족해요.');
  });
});
