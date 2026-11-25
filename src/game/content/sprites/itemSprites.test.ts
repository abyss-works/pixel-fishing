import { describe, expect, it } from 'vitest';
import { ARTIFACTS } from '../artifacts';
import { ENERGY_ITEM_IDS, RECIPES } from '../cooking';
import { POTIONS } from '../potions';
import { RARITY_ORDER } from '../rarity';
import { ARTIFACT_SPRITES, ENERGY_SPRITES, POTION_SPRITES, itemSprite } from './itemSprites';
import { SPRITE_TARGETS, definedLayout } from './targets';
import { TRANSPARENT, validateSprite } from './types';

function countConnectedOpaque(rows: readonly string[]): { total: number; component: number } {
  const h = rows.length, w = rows[0]?.length ?? 0;
  let total = 0;
  let start: [number, number] | null = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] !== TRANSPARENT) {
        total++;
        if (!start) start = [x, y];
      }
    }
  }
  if (!start) return { total: 0, component: 0 };
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, ny = cy + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || visited.has(key)) continue;
      if (rows[ny][nx] === TRANSPARENT) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return { total, component: visited.size };
}

function hasCheckerboard2x2(rows: readonly string[]): boolean {
  const h = rows.length, w = rows[0]?.length ?? 0;
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = rows[y][x], b = rows[y][x + 1];
      const c = rows[y + 1][x], d = rows[y + 1][x + 1];
      if (a === TRANSPARENT || b === TRANSPARENT || c === TRANSPARENT || d === TRANSPARENT) continue;
      if (a !== b && a === d && b === c) return true;
    }
  }
  return false;
}

function checkGridRules(rows: readonly string[], margin: number): string[] {
  const h = rows.length, w = rows[0]?.length ?? 0;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== TRANSPARENT;
  const violations: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!op(x, y)) continue;
      if (x < margin || y < margin || x > w - 1 - margin || y > h - 1 - margin) violations.push(`margin(${x},${y})`);
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && op(x + dx, y + dy)) neighbors++;
      if (neighbors === 0) violations.push(`floating(${x},${y})`);
      for (const dy of [1, -1]) {
        if (op(x + 1, y + dy) && !op(x + 1, y) && !op(x, y + dy)) violations.push(`diagonal(${x},${y})`);
      }
    }
  }
  return violations;
}

describe('요리·기운 아이템 스프라이트 해석', () => {
  it('모든 레시피가 자기 종류 대상의 격자와 색 배열을 갖는다', () => {
    for (const recipe of RECIPES) {
      const found = itemSprite(recipe.kind, recipe.id);
      expect(found, recipe.id).toBeDefined();
      const { grid } = definedLayout(SPRITE_TARGETS[recipe.kind === 'lunch' ? 'dish' : 'bait']);
      expect([found!.sprite.w, found!.sprite.h]).toEqual([grid.w, grid.h]);
      expect(found!.colors).toHaveLength(found!.sprite.palette.length);
      for (const c of found!.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('생명의 기운 4종이 모두 등록돼 있고 무결성·공통 규칙을 통과한다', () => {
    const { grid, margin } = definedLayout(SPRITE_TARGETS.dish);
    const expectedIds = RARITY_ORDER.map(r => ENERGY_ITEM_IDS[r]);
    expect(Object.keys(ENERGY_SPRITES).sort()).toEqual([...expectedIds].sort());
    for (const id of expectedIds) {
      const sprite = ENERGY_SPRITES[id];
      expect(sprite, id).toBeDefined();
      expect([sprite.w, sprite.h], id).toEqual([grid.w, grid.h]);
      expect(validateSprite(sprite), id).toEqual([]);
      for (const rows of sprite.frames) expect(checkGridRules(rows, margin), id).toEqual([]);
      const found = itemSprite('energy', id);
      expect(found, id).toBeDefined();
      expect(found!.sprite).toBe(sprite);
      expect(found!.colors).toHaveLength(sprite.palette.length);
      for (const c of found!.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('물약 스프라이트가 등록돼 있고 격자·연결성·채색 규칙을 통과한다', () => {
    const { grid, margin } = definedLayout(SPRITE_TARGETS.dish);
    const expectedIds = POTIONS.map(p => p.id);
    expect(Object.keys(POTION_SPRITES).sort()).toEqual([...expectedIds].sort());
    for (const id of expectedIds) {
      const sprite = POTION_SPRITES[id];
      expect(sprite, id).toBeDefined();
      expect([sprite.w, sprite.h], id).toEqual([grid.w, grid.h]);
      expect(validateSprite(sprite), id).toEqual([]);
      for (const rows of sprite.frames) {
        expect(checkGridRules(rows, margin), id).toEqual([]);
        const conn = countConnectedOpaque(rows);
        expect(conn.total, id).toBeGreaterThan(0);
        expect(conn.component, id).toBe(conn.total);
        expect(hasCheckerboard2x2(rows), id).toBe(false);
      }
      const found = itemSprite('potion', id);
      expect(found, id).toBeDefined();
      expect(found!.sprite).toBe(sprite);
      expect(found!.colors).toHaveLength(sprite.palette.length);
      for (const c of found!.colors) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(c.toLowerCase()).not.toBe('#182540');
      }
    }
  });

  it('유물 8종 스프라이트가 등록돼 있고 격자·연결성·채색 규칙을 통과한다', () => {
    const { grid, margin } = definedLayout(SPRITE_TARGETS.artifact);
    const expectedIds = ARTIFACTS.map(a => a.id);
    expect(Object.keys(ARTIFACT_SPRITES).sort()).toEqual([...expectedIds].sort());
    for (const id of expectedIds) {
      const sprite = ARTIFACT_SPRITES[id];
      expect(sprite, id).toBeDefined();
      expect([sprite.w, sprite.h], id).toEqual([grid.w, grid.h]);
      expect(validateSprite(sprite), id).toEqual([]);
      for (const rows of sprite.frames) {
        expect(checkGridRules(rows, margin), id).toEqual([]);
        const conn = countConnectedOpaque(rows);
        expect(conn.total, id).toBeGreaterThan(0);
        expect(conn.component, id).toBe(conn.total);
        expect(hasCheckerboard2x2(rows), id).toBe(false);
      }
      const found = itemSprite('artifact', id);
      expect(found, id).toBeDefined();
      expect(found!.sprite).toBe(sprite);
      expect(found!.colors).toHaveLength(sprite.palette.length);
      for (const c of found!.colors) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(c.toLowerCase()).not.toBe('#182540');
      }
    }
  });

  it('종류가 다른 대상의 id나 모르는 id는 undefined다', () => {
    expect(itemSprite('bait', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('lunch', 'cook-bait-rare')).toBeUndefined();
    expect(itemSprite('energy', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('potion', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('artifact', 'cook-lunch-bite')).toBeUndefined();
    expect(itemSprite('lunch', ENERGY_ITEM_IDS.common)).toBeUndefined();
    expect(itemSprite('lunch', 'luck-small')).toBeUndefined();
    expect(itemSprite('lunch', 'abyss-angler')).toBeUndefined();
    expect(itemSprite('lunch', 'nope')).toBeUndefined();
  });
});
