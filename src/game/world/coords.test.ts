// 게임 좌표계: 원점은 항해 창이 아니라 전지구 고정 원점이다.
import { describe, expect, it } from 'vitest';
import { compileMap, cellDefAt, cellIndex, indexCenter, mapBounds } from './mask';
import { gameToLonLat } from './geo';
import { WORLD, WORLD_MAP, WORLD_SPAWN, canMove, zoneOf, generateWorldSchools } from './index';
import type { MapCellDef } from './types';

const legend: Record<string, MapCellDef> = { '.': { water: true }, L: { land: true } };
const GLOBAL_COLS = 1440;
const ORIGIN_LAT = 85.0344827586207;

describe('격자 배치(창)', () => {
  // 같은 전지구 칸을 서로 다른 창으로 컴파일한다: B는 A보다 서쪽으로 3열, 북쪽으로 2행 더 넓다
  const a = compileMap(8, 11, legend, ['..L.', '....', '.L..'], { colOffset: 100, rowOffset: 50, globalCols: GLOBAL_COLS });
  const b = compileMap(8, 11, legend, ['.......', '.......', '.....L.', '.......', '....L..', '.......'], {
    colOffset: 97, rowOffset: 48, globalCols: GLOBAL_COLS,
  });

  it('창이 달라도 같은 게임 좌표의 칸은 같은 전지구 인덱스다', () => {
    // A의 (열 2, 행 0)은 전지구 (열 102, 행 50). B에서는 (열 5, 행 2)다.
    expect(cellIndex(a, 2, 0)).toBe(50 * GLOBAL_COLS + 102);
    expect(cellIndex(b, 5, 2)).toBe(50 * GLOBAL_COLS + 102);
    expect(cellIndex(a, 1, 2)).toBe(cellIndex(b, 4, 4));
  });

  it('인덱스의 칸 중앙은 창과 무관하다', () => {
    const idx = cellIndex(a, 2, 0);
    expect(indexCenter(a, idx)).toEqual(indexCenter(b, idx));
    expect(indexCenter(a, idx)).toEqual({ x: 102 * 8 + 4, y: 50 * 11 + 5 });
  });

  it('칸 중앙의 지형 판정은 두 창에서 같다', () => {
    const c = indexCenter(a, cellIndex(a, 2, 0));
    expect(cellDefAt(a, c.x, c.y)?.land).toBe(true);
    expect(cellDefAt(b, c.x, c.y)?.land).toBe(true);
    const water = indexCenter(a, cellIndex(a, 3, 0));
    expect(cellDefAt(a, water.x, water.y)?.land).toBeUndefined();
    expect(cellDefAt(b, water.x, water.y)?.land).toBeUndefined();
  });

  it('창의 영역은 칸 오프셋만큼 원점에서 떨어진다', () => {
    expect(mapBounds(a)).toEqual({ x: 800, y: 550, w: 32, h: 33 });
    expect(mapBounds(b)).toEqual({ x: 776, y: 528, w: 56, h: 66 });
  });

  it('창 밖 좌표의 셀 정의는 없다', () => {
    expect(cellDefAt(a, 799, 560)).toBeUndefined();
    expect(cellDefAt(a, 832, 560)).toBeUndefined();
    expect(cellDefAt(a, 810, 549)).toBeUndefined();
    expect(cellDefAt(a, 810, 583)).toBeUndefined();
    expect(cellDefAt(a, 810, 560)).toBeDefined();
  });

  it('배치를 생략하면 격자의 서북 모서리가 원점이다', () => {
    const local = compileMap(8, 11, legend, ['..', '..']);
    expect(mapBounds(local)).toEqual({ x: 0, y: 0, w: 16, h: 22 });
    expect(cellIndex(local, 1, 1)).toBe(3);
  });
});

describe('대양 좌표계', () => {
  it('창의 서북 모서리는 원점에서 정수 칸 떨어져 있고 경위도 15W 44N이다', () => {
    expect(WORLD.bounds).toEqual({ x: 660 * 8, y: 119 * 11, w: 688 * 8, h: 232 * 11 });
    const nw = gameToLonLat(WORLD.bounds.x, WORLD.bounds.y);
    expect(nw.lon).toBeCloseTo(-15, 9);
    expect(nw.lat).toBeCloseTo(44, 9);
  });

  it('원점은 경도 -180에서 열 0, 북위 85 이상에서 행 0이다', () => {
    expect(gameToLonLat(0, 0).lat).toBeGreaterThanOrEqual(85);
    expect(gameToLonLat(0, 0).lon).toBe(-180);
  });

  it('경위도 변환은 서로 역이고 경도 32px/°, 위도 31.9px/°다', () => {
    const x = (131.5 + 180) * 32, y = (ORIGIN_LAT - 31.5) * 31.9;
    const back = gameToLonLat(x, y);
    expect(back.lon).toBeCloseTo(131.5, 9);
    expect(back.lat).toBeCloseTo(31.5, 9);
    // 1000px 아래는 위도 1000/31.9도 남쪽이다
    expect(gameToLonLat(x, y).lat - gameToLonLat(x, y + 31.9).lat).toBeCloseTo(1, 9);
  });

  it('출발점(고향 항구 앞바다)은 131.5E 31.5N 자리의 게임 좌표다', () => {
    const { lon, lat } = gameToLonLat(WORLD_SPAWN.x, WORLD_SPAWN.y);
    expect(Math.abs(lon - 131.5)).toBeLessThan(1 / 32);
    expect(Math.abs(lat - 31.5)).toBeLessThan(1 / 31.9);
  });

  it('창 안의 바다는 이동할 수 있다', () => {
    expect(canMove(WORLD, WORLD_SPAWN.x, WORLD_SPAWN.y)).toBe(true);
  });

  it('창 밖 좌표는 이동할 수 없는 칸이고 구역도 없다', () => {
    const { x, y, w, h } = WORLD.bounds;
    const midX = x + w / 2, midY = y + h / 2;
    const outside: [string, number, number][] = [
      ['옛 원점', 0, 0],
      ['옛 창 좌표계의 출발점 자리', 3088, 399],
      ['서쪽', x - 20, midY],
      ['동쪽', x + w + 20, midY],
      ['북쪽', midX, y - 20],
      ['남쪽', midX, y + h + 20],
      ['동남쪽 먼 곳', x + w + 4000, y + h + 4000],
    ];
    for (const [name, px, py] of outside) {
      expect(canMove(WORLD, px, py), name).toBe(false);
      expect(zoneOf(WORLD, px, py), name).toBeUndefined();
    }
  });

  it('창 가장자리는 여유(4px) 안쪽부터 이동할 수 있다', () => {
    const { x, y, w, h } = WORLD.bounds;
    expect(canMove(WORLD, x - 1, y + h / 2)).toBe(false);
    expect(canMove(WORLD, x + 3, y + h / 2)).toBe(false);
    expect(canMove(WORLD, x + w - 1, y + h / 2)).toBe(false);
    expect(canMove(WORLD, x + w / 2, y + h - 1)).toBe(false);
  });

  it('어군은 전지구 칸의 중앙에 놓이고 창 안이다', () => {
    const { x, y, w, h } = WORLD.bounds;
    const schools = generateWorldSchools('2026-11-08');
    expect(schools.length).toBeGreaterThan(0);
    for (const s of schools) {
      expect(s.x, s.id).toBeGreaterThanOrEqual(x);
      expect(s.x, s.id).toBeLessThan(x + w);
      expect(s.y, s.id).toBeGreaterThanOrEqual(y);
      expect(s.y, s.id).toBeLessThan(y + h);
      // 칸 중앙: 가로 8px 칸의 4, 세로 11px 칸의 5
      expect((s.x - 4) % 8, s.id).toBe(0);
      expect((s.y - 5) % 11, s.id).toBe(0);
    }
  });

  it('지도 전체 칸 인덱스는 전지구 격자 안에 있다', () => {
    const last = cellIndex(WORLD_MAP, WORLD_MAP.cols - 1, WORLD_MAP.rows - 1);
    expect(last).toBe((119 + 231) * 1440 + 660 + 687);
  });
});

