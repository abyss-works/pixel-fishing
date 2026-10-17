import { describe, expect, it } from 'vitest';
import { FISH } from '../../../game/rules/logic';
import { biggestHolder, selectBiggestRows } from './ranking';

const [first, second, third] = FISH;

describe('어종별 월척', () => {
  const species = [
    { fishId: third.id, size: 30, nickname: '다', me: false },
    { fishId: first.id, size: 12.34, nickname: '가', me: true },
    { fishId: 'unknown-fish', size: 99, nickname: '?', me: false },
  ];

  it('어종 목록 순서로 이름과 함께 늘어놓고, 모르는 어종은 뺀다', () => {
    expect(selectBiggestRows(species)).toEqual([
      { fishId: first.id, name: first.name, rarity: first.rarity, size: 12.34, nickname: '가', me: true },
      { fishId: third.id, name: third.name, rarity: third.rarity, size: 30, nickname: '다', me: false },
    ]);
  });

  it('어종 하나의 주인을 찾는다', () => {
    expect(biggestHolder(species, first.id)).toEqual({ size: 12.34, nickname: '가', me: true });
    expect(biggestHolder(species, second.id)).toBeNull();
    expect(biggestHolder(null, first.id)).toBeNull();
  });
});
