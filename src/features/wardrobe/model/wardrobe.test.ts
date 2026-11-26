import { describe, it, expect } from 'vitest';
import { HATS, isAchievementHat } from '../../../game/content/wardrobe';
import { newState } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { clothesChanged, hatCountText, hatDetail, outfitName, resolveHatDisplay } from './wardrobe';

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
    expect(hatCountText(seed())).toBe(`0/${HATS.length}`);
    expect(hatCountText(seed({ hats: ['cap-red', 'cap-blue'] }))).toBe(`2/${HATS.length}`);
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
  it('아직 없는 업적 모자는 사기 대신 업적 잠금 상태고 해금 업적과 진척을 돌려준다', () => {
    const d = hatDetail(seed(), 'straw-hat');
    expect(d.action).toBe('achievement');
    expect(d.buyBlock).not.toBeNull();
    expect(d.unlock).toMatchObject({ achievementName: expect.any(String), condition: expect.any(String) });
    expect(d.unlock!.target).toBeGreaterThan(0);
    expect(d.unlock!.current).toBe(0);
  });
  it('가진 업적 모자는 쓰기 버튼이고 해금 업적 정보와 출처를 유지한다', () => {
    const game = seed({ hats: ['straw-hat'] });
    const d = hatDetail(game, 'straw-hat');
    expect(d).toMatchObject({
      owned: true,
      worn: false,
      price: 0,
      source: 'achievement',
      action: 'wear',
      buyBlock: null,
    });
    expect(d.unlock).toMatchObject({
      achievementName: '마을 돌연변이 도감',
      condition: expect.any(String),
    });
    expect(d.unlock!.target).toBeGreaterThan(0);

    const worn = hatDetail(seed({ hats: ['straw-hat'], look: { shirt: 0, pants: 0, hat: 'straw-hat' } }), 'straw-hat');
    expect(worn).toMatchObject({ owned: true, worn: true, source: 'achievement', action: 'unwear' });
    expect(worn.unlock).toEqual(d.unlock);
  });
  it('골드 모자는 보유 여부와 무관하게 source가 gold이고 unlock은 null이다', () => {
    expect(hatDetail(seed(), 'cap-red')).toMatchObject({ source: 'gold', unlock: null });
    expect(hatDetail(seed({ hats: ['cap-red'] }), 'cap-red')).toMatchObject({ owned: true, source: 'gold', unlock: null });
  });
  it('업적 모자가 아닌 모자는 업적 잠금 상태가 아니다', () => {
    const hat = HATS.find(h => !isAchievementHat(h))!;
    expect(hatDetail(seed(), hat.id).action).toBe('buy');
  });
  it('미토벌 네임드 업적 모자는 상세의 업적 이름과 조건에서 네임드 실명을 가린다', () => {
    const locked = hatDetail(seed(), 'megalodon-fin-cap');
    expect(locked.action).toBe('achievement');
    expect(locked.unlock).toEqual({
      achievementName: '태평양 네임드 토벌 5회',
      condition: '태평양의 네임드를 5회 토벌해요.',
      current: 0,
      target: 5,
    });
    expect(locked.unlock!.achievementName).not.toContain('메갈로돈');
    expect(locked.unlock!.condition).not.toContain('메갈로돈');

    const cleared = hatDetail(seed({ clearedNamed: ['pacific-named-megalodon'] }), 'megalodon-fin-cap');
    expect(cleared.unlock).toEqual({
      achievementName: '메갈로돈 토벌 5회',
      condition: '메갈로돈 토벌을 5회 마쳐요.',
      current: 1,
      target: 5,
    });
  });

  it('미보유 이벤트 모자는 사기(0G)가 아니라 이벤트 잠금 상태와 접속 선물 안내를 돌려준다', () => {
    const locked = hatDetail(seed({ gold: 1_000_000 }), 'santa-hat');
    expect(locked).toEqual({
      name: '산타모자',
      price: 0,
      source: 'event',
      owned: false,
      worn: false,
      action: 'event',
      buyBlock: '겨울 이벤트 기간에 접속하면 우편함으로 받을 수 있어요.',
      unlock: null,
      eventHint: '겨울 이벤트 기간에 접속하면 우편함으로 받을 수 있어요.',
    });
  });

  it('보유한 이벤트 모자는 쓰기·벗기 상태와 이벤트 출처 안내를 돌려준다', () => {
    const owned = hatDetail(seed({ hats: ['santa-hat'] }), 'santa-hat');
    expect(owned).toEqual({
      name: '산타모자',
      price: 0,
      source: 'event',
      owned: true,
      worn: false,
      action: 'wear',
      buyBlock: null,
      unlock: null,
      eventHint: '겨울 이벤트 접속 선물',
    });

    const worn = hatDetail(seed({ hats: ['santa-hat'], look: { shirt: 0, pants: 0, hat: 'santa-hat' } }), 'santa-hat');
    expect(worn).toMatchObject({
      owned: true,
      worn: true,
      source: 'event',
      action: 'unwear',
      eventHint: '겨울 이벤트 접속 선물',
    });
  });
});

describe('resolveHatDisplay', () => {
  it('등록된 모자는 이름과 외형을 돌려주고, 알 수 없는 id는 id와 null 외형을 돌려준다', () => {
    expect(resolveHatDisplay('santa-hat')).toEqual({
      id: 'santa-hat',
      name: '산타모자',
      look: { shirt: 0, pants: 0, hat: 'santa-hat' },
    });
    expect(resolveHatDisplay('unknown-hat')).toEqual({
      id: 'unknown-hat',
      name: 'unknown-hat',
      look: null,
    });
  });
});
