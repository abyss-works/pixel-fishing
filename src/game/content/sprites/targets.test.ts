import { describe, it, expect } from 'vitest';
import { SPRITE_KINDS, SPRITE_TARGETS, definedLayout, maxScale } from './targets';

describe('대상별 스프라이트 정의', () => {
  it('모든 대상 종류가 자기 종류 이름으로 정의돼 있다', () => {
    expect(SPRITE_KINDS).toEqual(['fish', 'boat', 'gear', 'dish', 'bait', 'artifact']);
    for (const kind of SPRITE_KINDS) expect(SPRITE_TARGETS[kind].kind).toBe(kind);
  });

  it('물고기·배·장비는 32×16 격자와 현재 표시 프리셋을 그대로 갖는다', () => {
    const fish = definedLayout(SPRITE_TARGETS.fish);
    expect(fish.grid).toEqual({ w: 32, h: 16 });
    expect(fish.margin).toBe(2);
    expect(fish.presets).toEqual({
      thumb: { w: 30, h: 16, scale: 1 },
      icon: { w: 84, h: 44, scale: 3 },
      portrait: { w: 240, h: 140, scale: 6 },
      card: { w: 160, h: 90, scale: 4 },
    });
    for (const kind of ['boat', 'gear'] as const) {
      const l = definedLayout(SPRITE_TARGETS[kind]);
      expect(l.grid).toEqual({ w: 32, h: 16 });
      expect(l.presets).toEqual({
        thumb: { w: 32, h: 16, scale: 1 },
        row: { w: 64, h: 32, scale: 2 },
        hero: { w: 96, h: 48, scale: 3 },
      });
    }
  });

  it('모든 프리셋은 정수 배율이다', () => {
    for (const kind of SPRITE_KINDS) {
      const layout = SPRITE_TARGETS[kind].layout;
      if (!layout) continue;
      for (const p of Object.values(layout.presets)) expect(Number.isInteger(p.scale)).toBe(true);
    }
  });

  it('요리·미끼·유물은 격자와 배율이 미정이라 layout이 없고 definedLayout이 거부한다', () => {
    for (const kind of ['dish', 'bait', 'artifact'] as const) {
      expect(SPRITE_TARGETS[kind].layout).toBeNull();
      expect(() => definedLayout(SPRITE_TARGETS[kind])).toThrow(kind);
    }
  });

  it('움직임은 물고기만 갖고 상태 행은 대상마다 하나 이상이다', () => {
    expect(SPRITE_TARGETS.fish.motion).toBe('swim');
    expect(SPRITE_TARGETS.fish.states).toEqual(['normal', 'variant', 'hidden']);
    for (const kind of SPRITE_KINDS) {
      if (kind !== 'fish') expect(SPRITE_TARGETS[kind].motion).toBe('none');
      expect(SPRITE_TARGETS[kind].states.length).toBeGreaterThan(0);
    }
  });

  it('최대 배율은 프리셋 가운데 가장 큰 값이다', () => {
    expect(maxScale(definedLayout(SPRITE_TARGETS.fish))).toBe(6);
    expect(maxScale(definedLayout(SPRITE_TARGETS.boat))).toBe(3);
  });
});
