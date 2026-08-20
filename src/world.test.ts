// R4, R4b: 바다 충돌/군집 배치/항로 무결성 
import { describe, it, expect } from 'vitest';
import {
  WORLD_W, WORLD_H, ZONES, HOME_ISLAND, ISLANDS, DOCK, SPAWN, SCHOOLS, CAST_RANGE, FURNITURE,
  zoneAt, canSail, movePlayer, atDock, nearestSchoolInRange, furnitureAt,
} from './world';

describe('R4: 충돌', () => {
  it('열린 바다는 항해 가능', () => {
    expect(canSail(SPAWN.x, SPAWN.y)).toBe(true);
    expect(canSail(400, 160)).toBe(true);
    expect(canSail(550, 250)).toBe(true);
  });

  it('집 섬과 장애물 섬은 통과 불가', () => {
    expect(canSail(HOME_ISLAND.x + 10, HOME_ISLAND.y + 10)).toBe(false);
    for (const i of ISLANDS) {
      expect(canSail(i.x + i.w / 2, i.y + i.h / 2)).toBe(false);
    }
  });

  it('월드 경계는 통과 불가', () => {
    expect(canSail(-5, 100)).toBe(false);
    expect(canSail(WORLD_W + 5, 100)).toBe(false);
    expect(canSail(100, -5)).toBe(false);
    expect(canSail(100, WORLD_H + 5)).toBe(false);
  });

  it('섬으로 항해하면 막히고, 해안선을 따라 미끄러진다', () => {
    // 첫 장애물 섬(170,40 50×28) 왼쪽 물가에서 동쪽으로 계속 밀기
    // 게임 루프는 dt를 0.05s로 캡: 프레임당 최대 4.25px — 같은 조건으로 검증
    let pos = { x: 166, y: 54 };
    expect(canSail(pos.x, pos.y)).toBe(true);
    for (let i = 0; i < 40; i++) pos = movePlayer(pos, 1, 0, 0.05); // 2초 동안 밀어도
    expect(canSail(pos.x, pos.y)).toBe(true); // 섬에 안 박힘
    expect(pos.x).toBeLessThan(170);
    // 대각 입력: x축이 막혀도 y축으로 미끄러짐
    let slid = { x: 166, y: 54 };
    for (let i = 0; i < 10; i++) slid = movePlayer(slid, 1, 1, 0.05);
    expect(slid.y).toBeGreaterThan(54);
    expect(canSail(slid.x, slid.y)).toBe(true);
  });
});

describe('R4b: 레벨디자인 무결성', () => {
  it('모든 군집은 자기 티어 해역의 항해 가능한 물 위에 있다', () => {
    for (const s of SCHOOLS) {
      expect(zoneAt(s.x, s.y), s.id).toBe(s.spot);
      expect(canSail(s.x, s.y), s.id).toBe(true);
    }
  });

  it('모든 군집은 선착장 출발점에서 항로로 도달 가능하다 (BFS)', () => {
    // 4px 격자 BFS — 장애물 섬이 항로를 완전히 막으면 실패
    const STEP = 4;
    const cols = Math.ceil(WORLD_W / STEP), rows = Math.ceil(WORLD_H / STEP);
    const key = (cx: number, cy: number) => cy * cols + cx;
    const visited = new Uint8Array(cols * rows);
    const queue: [number, number][] = [[Math.round(SPAWN.x / STEP), Math.round(SPAWN.y / STEP)]];
    visited[key(queue[0][0], queue[0][1])] = 1;
    while (queue.length) {
      const [cx, cy] = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (visited[key(nx, ny)]) continue;
        if (!canSail(nx * STEP, ny * STEP)) continue;
        visited[key(nx, ny)] = 1;
        queue.push([nx, ny]);
      }
    }
    for (const s of SCHOOLS) {
      const reached = visited[key(Math.round(s.x / STEP), Math.round(s.y / STEP))] === 1;
      expect(reached, `${s.id} 군집으로 가는 항로가 막혀 있음`).toBe(true);
    }
  });

  it('해역 태그가 유효하고 4해역 전부 군집이 있다', () => {
    const tags = new Set(ZONES.map(z => z.spot));
    for (const s of SCHOOLS) expect(tags.has(s.spot), s.id).toBe(true);
    for (const z of ZONES) {
      expect(SCHOOLS.some(s => s.spot === z.spot), z.spot).toBe(true);
    }
  });
});

describe('R5: 군집 판정 반경', () => {
  it('군집 위에 있으면 그 군집, 밖이면 null', () => {
    const s = SCHOOLS[0];
    expect(nearestSchoolInRange(s.x + 10, s.y - 10)?.id).toBe(s.id);
    expect(nearestSchoolInRange(s.x + CAST_RANGE + 5, s.y)).toBeNull();
    expect(nearestSchoolInRange(SPAWN.x, SPAWN.y)).toBeNull(); // 선착장 앞은 군집 없음
  });
});

describe('R5c: 선착장 트리거', () => {
  it('선착장 안이면 true, 출발점은 false', () => {
    expect(atDock({ x: DOCK.x + DOCK.w / 2, y: DOCK.y + DOCK.h / 2 })).toBe(true);
    expect(atDock(SPAWN)).toBe(false);
  });

  it('선착장은 항해로 진입 가능한 물 위다', () => {
    expect(canSail(DOCK.x + DOCK.w / 2, DOCK.y + DOCK.h / 2)).toBe(true);
  });
});

describe('가구 히트테스트 (R1~R3b)', () => {
  it('각 가구 중심을 클릭하면 해당 가구', () => {
    for (const f of FURNITURE) {
      expect(furnitureAt(f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
    }
  });
  it('빈 공간은 null', () => {
    expect(furnitureAt(160, 40)).toBeNull();
  });
});
