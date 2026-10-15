import { describe, it, expect } from 'vitest';
import {
  fishColors, fishRings, fishSprite, spriteKey,
  FISH_SHAPE_SPRITES, FISH_SPRITES, FISH_SPRITES_GENERATED, OUTLINE_DARK, SILHOUETTE,
} from './index';
import { validateSprite, cellIndex, TRANSPARENT } from './types';
import { FISH } from '../fish';
import { NAMED } from '../named';
import { RARITY } from '../rarity';

const NATIVE = [64, 32];

describe('원화 격자 (생성 파일)', () => {
  it('모든 어종에 일반·변이 격자가 있고 네임드에 일반 격자가 있다', () => {
    for (const f of FISH) {
      expect(FISH_SPRITES_GENERATED[spriteKey(f.id, 'normal')], f.id).toBeDefined();
      expect(FISH_SPRITES_GENERATED[spriteKey(f.id, 'variant')], f.id).toBeDefined();
    }
    for (const n of NAMED) expect(FISH_SPRITES_GENERATED[n.id], n.id).toBeDefined();
  });

  it('격자는 전부 64×32이고 무결성 오류가 없으며 팔레트는 고정 hex다', () => {
    for (const [key, s] of Object.entries(FISH_SPRITES_GENERATED)) {
      expect([s.w, s.h], key).toEqual(NATIVE);
      expect(validateSprite(s), key).toEqual([]);
      expect(s.palette.every(p => typeof p === 'string' && /^#[0-9a-f]{6}$/.test(p)), key).toBe(true);
    }
  });

  it('생성 격자의 키는 실제 어종·네임드 id다 — 고아 파일을 막는다', () => {
    const ids = new Set([...FISH.map(f => f.id), ...NAMED.map(n => n.id)]);
    for (const key of Object.keys(FISH_SPRITES_GENERATED)) {
      expect(ids.has(key.replace(/\.variant$/, '')), key).toBe(true);
    }
  });

  it('어종끼리 같은 그림을 쓰지 않는다 (일반 폼 기준)', () => {
    const grids = FISH.map(f => fishSprite(f).frames[0].join('\n'));
    expect(new Set(grids).size).toBe(grids.length);
  });
});

describe('형태 격자 (초안 생성기)', () => {
  it('모든 shape에 64×32 격자가 있고 무결성 오류가 없다', () => {
    const shapes = new Set([...FISH.map(f => f.shape), ...NAMED.map(n => n.shape)]);
    for (const shape of shapes) {
      const s = FISH_SHAPE_SPRITES[shape];
      expect(s, shape).toBeDefined();
      expect([s.w, s.h], shape).toEqual(NATIVE);
      expect(validateSprite(s), shape).toEqual([]);
    }
  });
});

describe('종별 수정 격자', () => {
  it('등록된 수정 격자는 모두 실제 키이고 무결성 오류가 없다', () => {
    const ids = new Set(FISH.map(f => f.id));
    for (const [key, s] of Object.entries(FISH_SPRITES)) {
      expect(ids.has(key.replace(/\.variant$/, '')), key).toBe(true);
      expect(validateSprite(s!), key).toEqual([]);
    }
  });
});

describe('어종 → 격자·색 배열', () => {
  const carp = FISH.find(f => f.id === 'carp')!;

  it('일반과 변이는 다른 격자(원화)를 가리키고, 미발견은 전 슬롯이 실루엣 색이다', () => {
    expect(fishSprite(carp, 'variant')).not.toBe(fishSprite(carp, 'normal'));
    const colors = fishColors(carp, 'normal', false);
    expect(colors.every(c => c === SILHOUETTE)).toBe(true);
    expect(colors.length).toBe(fishSprite(carp).palette.length);
  });

  it('원화 격자의 색 배열은 팔레트 그대로다 — 기준색이 끼어들지 않는다', () => {
    expect(fishColors(carp)).toEqual(fishSprite(carp).palette);
  });

  it('격자의 모든 인덱스가 색 배열 안에 있다', () => {
    for (const f of FISH) for (const form of ['normal', 'variant'] as const) {
      const colors = fishColors(f, form);
      for (const row of fishSprite(f, form).frames[0]) {
        for (const ch of row) {
          if (ch === TRANSPARENT) continue;
          expect(colors[cellIndex(ch)!], `${f.id}.${form}`).toBeDefined();
        }
      }
    }
  });

  it('원화가 없는 어종은 형태 격자로 떨어진다', () => {
    const ghost = { id: 'no-such-fish', shape: 'slim' as const };
    expect(fishSprite(ghost)).toBe(FISH_SHAPE_SPRITES.slim);
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
