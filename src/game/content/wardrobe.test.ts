import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LOOK, HATS, LOOK_PRESETS, PANTS_COLORS, SHIRT_COLORS, hatById, isAchievementHat, safeLook,
} from './wardrobe';

const HEX = /^#[0-9a-f]{6}$/;

describe('옷장 콘텐츠', () => {
  it('팔레트는 웃옷 12색, 바지 12색이며 모두 6자리 색 코드다', () => {
    expect(SHIRT_COLORS).toHaveLength(12);
    expect(PANTS_COLORS).toHaveLength(12);
    for (const c of [...SHIRT_COLORS, ...PANTS_COLORS]) expect(c).toMatch(HEX);
    expect(new Set(SHIRT_COLORS).size).toBe(12);
    expect(new Set(PANTS_COLORS).size).toBe(12);
  });

  it('기본 외형은 이전에 모두가 쓰던 웃옷과 바지 색이고 모자가 없다', () => {
    expect(DEFAULT_LOOK).toEqual({ shirt: 0, pants: 0, hat: null });
    expect(SHIRT_COLORS[0]).toBe('#3f6d4e');
    expect(PANTS_COLORS[0]).toBe('#31427a');
  });

  it('프리셋 여섯 개의 번호는 모두 팔레트 안이다', () => {
    expect(LOOK_PRESETS.map(p => p.name)).toEqual(['기본', '어부', '노을', '해군', '숲', '밤바다']);
    expect(LOOK_PRESETS[0]).toMatchObject({ shirt: 0, pants: 0 });
    for (const p of LOOK_PRESETS) {
      expect(p.shirt).toBeLessThan(SHIRT_COLORS.length);
      expect(p.pants).toBeLessThan(PANTS_COLORS.length);
    }
  });

  it('모자는 골드 5종과 업적 41종으로 총 46종이고 id가 겹치지 않는다', () => {
    expect(HATS).toHaveLength(46);
    expect(new Set(HATS.map(h => h.id)).size).toBe(46);

    const goldHats = HATS.slice(0, 5);
    expect(goldHats.map(h => h.id)).toEqual(['cap-red', 'cap-blue', 'cap-yellow', 'cap-green', 'cap-black']);
    expect(goldHats.map(h => h.price)).toEqual([50_000, 50_000, 100_000, 200_000, 500_000]);
    for (const h of goldHats) {
      expect(h.source).toBe('gold');
      expect(isAchievementHat(h)).toBe(false);
      expect(h.color).toMatch(HEX);
      expect(Number.isInteger(h.price) && h.price > 0).toBe(true);
    }

    const achHats = HATS.slice(5);
    expect(achHats).toHaveLength(41);
    expect(achHats.map(h => h.id)).toEqual([
      'straw-hat', 'sou-wester', 'coral-bandana', 'saffron-turban', 'worn-tricorn', 'fog-beanie',
      'braid-captain-cap', 'anchor-beret', 'watch-sailor-cap', 'earflap-cap',
      'crescent-hood', 'ink-hood', 'polar-beret', 'polar-knit-cap',
      'strait-night-cap', 'inkglass-beanie', 'lookout-storm-hat', 'pitch-lookout-cap',
      'lure-bucket-hat', 'gold-hook-hat', 'harpooner-pillbox', 'shipowner-bowler', 'salt-fisher-cap',
      'megalodon-work-cap', 'megalodon-fin-cap', 'megalodon-silver-visor',
      'leviathan-dive-hood', 'leviathan-bell-cap', 'leviathan-serpent-hat',
      'ananta-lantern-hood', 'ananta-rope-cap', 'ananta-astrolabe-hat',
      'dunkleos-trawl-hat', 'dunkleos-rivet-leather', 'dunkleos-jaw-helm',
      'adamastor-pier-cap', 'adamastor-storm-hood', 'adamastor-lantern-hood',
      'jasconius-island-cap', 'jasconius-ember-visor', 'jasconius-rockback-hat',
    ]);
    for (const h of achHats) {
      expect(h.source).toBe('achievement');
      expect(isAchievementHat(h)).toBe(true);
      expect(h.achievementId).toBeTruthy();
      expect(h.price).toBe(0);
      expect(h.color).toMatch(HEX);
      if (h.accentColor !== undefined) expect(h.accentColor).toMatch(HEX);
    }
  });

  it('hatById는 있는 id만 돌려준다', () => {
    expect(hatById('cap-red')?.name).toBe('빨간 모자');
    expect(hatById('nope')).toBeUndefined();
    expect(hatById(null)).toBeUndefined();
    expect(hatById(3)).toBeUndefined();
  });
});

describe('safeLook', () => {
  it('올바른 외형은 그대로 돌려준다', () => {
    expect(safeLook({ shirt: 11, pants: 5, hat: 'cap-green' })).toEqual({ shirt: 11, pants: 5, hat: 'cap-green' });
    expect(safeLook({ shirt: 0, pants: 0, hat: null })).toEqual(DEFAULT_LOOK);
  });

  it('모자 필드가 없으면 모자 없음으로 읽는다', () => {
    expect(safeLook({ shirt: 2, pants: 3 })).toEqual({ shirt: 2, pants: 3, hat: null });
  });

  it('없거나 형식이 틀리거나 범위를 벗어나면 기본 외형이다', () => {
    for (const raw of [
      undefined, null, 5, 'x', [], {},
      { shirt: 12, pants: 0, hat: null },
      { shirt: 0, pants: 12, hat: null },
      { shirt: -1, pants: 0, hat: null },
      { shirt: 1.5, pants: 0, hat: null },
      { shirt: '1', pants: 0, hat: null },
      { shirt: 0, pants: 0, hat: 'cap-purple' },
      { shirt: 0, pants: 0, hat: 7 },
    ]) expect(safeLook(raw), JSON.stringify(raw)).toEqual(DEFAULT_LOOK);
  });

  it('필요한 필드만 남긴다', () => {
    expect(safeLook({ shirt: 1, pants: 2, hat: null, extra: 1 })).toEqual({ shirt: 1, pants: 2, hat: null });
  });
});
