import { describe, it, expect } from 'vitest';
import { fishColors, fishRings, fishSprite, FISH_SHAPE_SPRITES, FISH_SPRITES, OUTLINE_DARK, SILHOUETTE } from './index';
import { validateSprite, cellIndex, TRANSPARENT } from './types';
import { FISH } from '../fish';
import { NAMED } from '../named';
import { RARITY } from '../rarity';
import { shade } from '../../../shared/lib/color';

describe('종별 전용 격자', () => {
  it('등록된 전용 격자는 모두 실제 어종 id이고 무결성 오류가 없다', () => {
    const ids = new Set(FISH.map(f => f.id));
    for (const [id, s] of Object.entries(FISH_SPRITES)) {
      expect(ids.has(id), id).toBe(true);
      expect(validateSprite(s!), id).toEqual([]);
    }
  });
});

describe('몸 둘레 링', () => {
  it('윤곽은 항상 어둡고, 영웅·전설만 등급색 오라가 붙으며, 미발견은 링이 없다', () => {
    expect(fishRings({ rarity: 'legendary' })).toEqual({ outline: OUTLINE_DARK, aura: RARITY.legendary.color });
    expect(fishRings({ rarity: 'epic' })).toEqual({ outline: OUTLINE_DARK, aura: RARITY.epic.color });
    expect(fishRings({ rarity: 'rare' })).toEqual({ outline: OUTLINE_DARK });
    expect(fishRings({ rarity: 'common' })).toEqual({ outline: OUTLINE_DARK });
    expect(fishRings({ rarity: 'legendary' }, false)).toEqual({});
  });
});

describe('형태 격자 (생성 파일)', () => {
  it('모든 어종·네임드의 shape에 32×16 격자가 있고 무결성 오류가 없다', () => {
    const shapes = new Set([...FISH.map(f => f.shape), ...NAMED.map(n => n.shape)]);
    for (const shape of shapes) {
      const s = FISH_SHAPE_SPRITES[shape];
      expect(s, shape).toBeDefined();
      expect([s.w, s.h], shape).toEqual([32, 16]);
      expect(validateSprite(s), shape).toEqual([]);
    }
  });

  it('격자마다 불투명 셀이 있고 기준색 슬롯({ shade: 1 })을 쓴다', () => {
    for (const [shape, s] of Object.entries(FISH_SHAPE_SPRITES)) {
      const opaque = s.frames[0].join('').replaceAll(TRANSPARENT, '').length;
      expect(opaque, shape).toBeGreaterThan(0);
      expect(s.palette.some(p => typeof p === 'object' && p.shade === 1), shape).toBe(true);
    }
  });

  it('14형태가 서로 다른 격자다 — 같은 그림이 두 이름으로 존재하지 않는다', () => {
    const keys = Object.values(FISH_SHAPE_SPRITES).map(s => s.frames[0].join('\n'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('어종 → 색 배열', () => {
  const carp = FISH.find(f => f.id === 'carp')!;

  it('일반은 종 색, 변이는 변이 색을 기준으로 슬롯을 해석한다', () => {
    const s = fishSprite(carp);
    const body = s.palette.findIndex(p => typeof p === 'object' && p.shade === 1);
    expect(fishColors(carp)[body]).toBe(shade(carp.color, 1));
    expect(fishColors(carp, 'variant')[body]).toBe(shade(carp.variant.color, 1));
  });

  it('미발견은 전 슬롯이 실루엣 색이다 — 눈·하이라이트도 숨긴다', () => {
    const colors = fishColors(carp, 'normal', false);
    expect(colors.every(c => c === SILHOUETTE)).toBe(true);
    expect(colors.length).toBe(fishSprite(carp).palette.length);
  });

  it('격자의 모든 인덱스가 색 배열 안에 있다', () => {
    for (const f of FISH) {
      const colors = fishColors(f);
      for (const row of fishSprite(f).frames[0]) {
        for (const ch of row) {
          if (ch === TRANSPARENT) continue;
          expect(colors[cellIndex(ch)!], f.id).toBeDefined();
        }
      }
    }
  });
});
