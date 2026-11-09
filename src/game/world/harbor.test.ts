// 항구 배치 계약: 기준점과 바다 방향 두 값에서 건물·부두·접안 자리·출항 자리가 같은 규칙으로 정해진다.
import { describe, expect, it } from 'vitest';
import { BASE_PACKS, WORLD } from './index';
import { HARBORS } from './regions/world';
import { DEPARTURE_DIST } from './harborPlacement';
import { cellDefAt } from './mask';
import type { Rect } from './types';

const WORLD_MAP = WORLD.map!;
const isLand = (x: number, y: number) => !!cellDefAt(WORLD_MAP, x, y)?.land;
const isWater = (x: number, y: number) => !!cellDefAt(WORLD_MAP, x, y)?.water;

function fraction(r: Rect, test: (x: number, y: number) => boolean): number {
  let hit = 0;
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) if (test(x, y)) hit++;
  return hit / (r.w * r.h);
}
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const gap = (a: Rect, b: Rect) => Math.hypot(
  Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0));
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const SEA_VECTOR = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] } as const;

describe.each(Object.entries(HARBORS))('항구 %s 배치', (id, h) => {
  it('건물은 전부 육지이고 기준점에서 바다 반대쪽에 있다', () => {
    expect(fraction(h.building, isLand)).toBe(1);
    const [ux, uy] = SEA_VECTOR[h.facing];
    const b = center(h.building);
    expect((b.x - h.anchor.x) * ux + (b.y - h.anchor.y) * uy).toBeLessThan(0);
  });

  it('부두는 건물에 빈칸도 겹침도 없이 맞닿는다', () => {
    expect(gap(h.building, h.dock)).toBe(0);
    expect(overlap(h.building, h.dock)).toBe(0);
  });

  it('접안 자리는 전부 물이고 부두 끝에 맞닿으며 부두와 겹치지 않는다', () => {
    expect(fraction(h.berth, isWater)).toBe(1);
    expect(gap(h.dock, h.berth)).toBe(0);
    expect(overlap(h.dock, h.berth)).toBe(0);
  });

  it('출항 자리는 물 위이고 접안 자리 밖이며 접안 중심에서 공통 거리만큼 떨어져 있다', () => {
    expect(isWater(h.departure.x, h.departure.y)).toBe(true);
    const c = center(h.berth);
    expect(Math.hypot(h.departure.x - c.x, h.departure.y - c.y)).toBe(DEPARTURE_DIST);
    expect(overlap(h.berth, { ...h.departure, w: 1, h: 1 })).toBe(0);
  });

  it('접안 중심에서 출항 자리까지 직선에 육지가 없다', () => {
    const c = center(h.berth);
    let land = 0;
    for (let i = 0; i <= DEPARTURE_DIST; i++) {
      const t = i / DEPARTURE_DIST;
      if (isLand(Math.round(c.x + (h.departure.x - c.x) * t), Math.round(c.y + (h.departure.y - c.y) * t))) land++;
    }
    expect(land).toBe(0);
  });

  it('지역 데이터가 같은 값을 쓴다 — 건물, 부두, 접안 트리거, 출항 자리', () => {
    expect(WORLD.buildings.some(b => b.rect === h.building && b.sprite === 'harbor')).toBe(true);
    expect(WORLD.decks!.some(d => d.rect === h.dock)).toBe(true);
    expect(WORLD.triggers.find(t => t.action === 'base' && t.base === id)?.rect).toEqual(h.berth);
    expect(BASE_PACKS[id as keyof typeof BASE_PACKS].exitAt).toEqual(h.departure);
  });
});

it('모든 항구가 같은 크기의 건물·부두·접안 자리를 쓴다', () => {
  const all = Object.values(HARBORS);
  const uniq = (f: (h: (typeof all)[number]) => unknown) => new Set(all.map(h => JSON.stringify(f(h)))).size;
  expect(uniq(h => [h.building.w, h.building.h])).toBe(1);
  expect(uniq(h => [h.berth.w, h.berth.h])).toBe(1);
  expect(uniq(h => [Math.max(h.dock.w, h.dock.h), Math.min(h.dock.w, h.dock.h)])).toBe(1);
});
