// R4, R4b: 2지역(마을/대양) 충돌·군집 배치·경로 무결성 
import { describe, it, expect } from 'vitest';
import {
  CAST_RANGE, REGION_DEFS,
  V_POND, V_HOUSE, V_DOOR, V_SPAWN, V_BRIDGE, V_PIER, V_PORT, V_SCHOOLS,
  V_BOATSHOP, V_BOATSHOP_TRIGGER,
  LANDS, TRENCH, O_DOCK, O_SPAWN, O_SCHOOLS,
  canWalkVillage, villageZoneAt, canSailOcean, oceanZoneAt,
  movePlayer, inTrigger, nearestSchoolInRange, furnitureAt,
  HOME_FURNITURE, HARBOR_FURNITURE,
} from './world';
import type { RegionDef, School } from './world';

// 시작점에서 BFS — 군집마다 판정 반경 안에 도달 가능한 칸이 있는지 검증
function reachabilityCheck(def: RegionDef) {
  const STEP = 4;
  const cols = Math.ceil(def.w / STEP), rows = Math.ceil(def.h / STEP);
  const key = (cx: number, cy: number) => cy * cols + cx;
  const visited = new Uint8Array(cols * rows);
  const queue: [number, number][] = [[Math.round(def.spawn.x / STEP), Math.round(def.spawn.y / STEP)]];
  visited[key(queue[0][0], queue[0][1])] = 1;
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[key(nx, ny)]) continue;
      if (!def.canMove(nx * STEP, ny * STEP)) continue;
      visited[key(nx, ny)] = 1;
      queue.push([nx, ny]);
    }
  }
  const reachableNear = (s: School) => {
    const r = Math.ceil(CAST_RANGE / STEP);
    const scx = Math.round(s.x / STEP), scy = Math.round(s.y / STEP);
    for (let cx = scx - r; cx <= scx + r; cx++) {
      for (let cy = scy - r; cy <= scy + r; cy++) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        if (Math.hypot(cx * STEP - s.x, cy * STEP - s.y) > CAST_RANGE) continue;
        if (visited[key(cx, cy)]) return true;
      }
    }
    return false;
  };
  return { visited, key, reachableNear, STEP, cols };
}

// ============ 지역 1: 마을 ============

describe('마을 R4: 충돌 (도보)', () => {
  it('땅은 걷고 물은 못 걷는다', () => {
    expect(canWalkVillage(V_SPAWN.x, V_SPAWN.y)).toBe(true);
    expect(canWalkVillage(150, 120)).toBe(false); // 연못
    expect(canWalkVillage(400, 220)).toBe(false); // 강
    expect(canWalkVillage(100, 330)).toBe(false); // 남쪽 바다
    expect(canWalkVillage(V_HOUSE.x + 10, V_HOUSE.y + 10)).toBe(false); // 집
  });

  it('다리와 포구 부두는 물 위에서도 걷는다', () => {
    expect(canWalkVillage(V_BRIDGE.x + 10, 220)).toBe(true);  // 강 위 다리
    expect(canWalkVillage(V_PIER.x + 8, 330)).toBe(true);     // 바다 위 부두
  });

  it('연못으로 걸으면 막히고, 물가를 따라 미끄러진다', () => {
    let pos = { x: 106, y: 120 }; // 연못 서쪽 물가
    expect(canWalkVillage(pos.x, pos.y)).toBe(true);
    for (let i = 0; i < 40; i++) pos = movePlayer(REGION_DEFS.village, pos, 1, 0, 0.05, 75);
    expect(canWalkVillage(pos.x, pos.y)).toBe(true);
    expect(pos.x).toBeLessThan(V_POND.x);
    let slid = { x: 106, y: 120 };
    for (let i = 0; i < 10; i++) slid = movePlayer(REGION_DEFS.village, slid, 1, 1, 0.05, 75);
    expect(slid.y).toBeGreaterThan(120);
    expect(canWalkVillage(slid.x, slid.y)).toBe(true);
  });
});

describe('마을 R4b: 레벨디자인 무결성', () => {
  it('군집은 자기 물(연못/강) 위에 있다', () => {
    for (const s of V_SCHOOLS) {
      expect(villageZoneAt(s.x, s.y), s.id).toBe(s.spot);
    }
  });

  it('모든 군집·포구는 집 앞에서 걸어서 도달 가능 (BFS)', () => {
    const { reachableNear, visited, key, STEP } = reachabilityCheck(REGION_DEFS.village);
    for (const s of V_SCHOOLS) {
      expect(reachableNear(s), `${s.id}에 닿을 물가가 없음`).toBe(true);
    }
    // 포구 트리거 지점도 걸어서 도달 가능(다리 건너 부두)
    const px = Math.round((V_PORT.x + V_PORT.w / 2) / STEP);
    const py = Math.round((V_PORT.y + 2) / STEP);
    expect(visited[key(px, py)], '포구로 가는 길이 막혀 있음').toBe(1);
  });
});

describe('마을 트리거', () => {
  it('집 문/포구 트리거, 시작점은 어느 쪽도 아님', () => {
    expect(inTrigger({ x: V_DOOR.x + 10, y: V_DOOR.y + 4 }, V_DOOR)).toBe(true);
    expect(inTrigger({ x: V_PORT.x + 8, y: V_PORT.y + 6 }, V_PORT)).toBe(true);
    expect(inTrigger(V_SPAWN, V_DOOR)).toBe(false);
    expect(inTrigger(V_SPAWN, V_PORT)).toBe(false);
  });

  it('목공소: 건물은 충돌체, 문 앞 트리거는 걸을 수 있는 땅 위', () => {
    expect(canWalkVillage(V_BOATSHOP.x + 10, V_BOATSHOP.y + 10)).toBe(false); // 건물 통과 불가
    const tc = { x: V_BOATSHOP_TRIGGER.x + 4, y: V_BOATSHOP_TRIGGER.y + 10 };
    expect(canWalkVillage(tc.x, tc.y)).toBe(true);            // 트리거 지점은 접근 가능
    expect(inTrigger(tc, V_BOATSHOP_TRIGGER)).toBe(true);
    expect(inTrigger(V_SPAWN, V_BOATSHOP_TRIGGER)).toBe(false);
    expect(REGION_DEFS.village.shopTrigger).toBe(V_BOATSHOP_TRIGGER); // 필드 트리거로 연결됨
    expect(REGION_DEFS.ocean.shopTrigger).toBeUndefined();            // 대양은 조선소(항구 내)
  });
});

// ============ 지역 2: 대양 ============

describe('대양 R4: 충돌 (항해)', () => {
  it('열린 바다는 항해 가능, 대륙/경계는 불가', () => {
    expect(canSailOcean(O_SPAWN.x, O_SPAWN.y)).toBe(true);
    expect(canSailOcean(500, 100)).toBe(true);
    expect(canSailOcean(700, 450)).toBe(true);
    for (const l of LANDS) {
      expect(canSailOcean(l.x + l.w / 2, l.y + l.h / 2), l.name ?? `${l.x},${l.y}`).toBe(false);
    }
    expect(canSailOcean(-5, 100)).toBe(false);
    expect(canSailOcean(100, 545)).toBe(false);
  });

  it('해역 판정: 해구 안=deep, 밖=sea', () => {
    expect(oceanZoneAt(TRENCH.x + 10, TRENCH.y + 10)).toBe('deep');
    expect(oceanZoneAt(100, 100)).toBe('sea');
  });
});

describe('대양 R4b: 레벨디자인 무결성', () => {
  it('군집은 자기 해역의 항해 가능한 물 위에 있다', () => {
    for (const s of O_SCHOOLS) {
      expect(oceanZoneAt(s.x, s.y), s.id).toBe(s.spot);
      expect(canSailOcean(s.x, s.y), s.id).toBe(true);
    }
  });

  it('모든 군집은 항구에서 항로로 도달 가능 (BFS)', () => {
    const { reachableNear } = reachabilityCheck(REGION_DEFS.ocean);
    for (const s of O_SCHOOLS) {
      expect(reachableNear(s), `${s.id}로 가는 항로가 막혀 있음`).toBe(true);
    }
  });
});

describe('대양 트리거', () => {
  it('접안 트리거는 항해 가능한 물 위, 시작점은 트리거 밖', () => {
    const dc = { x: O_DOCK.x + O_DOCK.w / 2, y: O_DOCK.y + O_DOCK.h / 2 };
    expect(inTrigger(dc, O_DOCK)).toBe(true);
    expect(canSailOcean(dc.x, dc.y)).toBe(true);
    expect(inTrigger(O_SPAWN, O_DOCK)).toBe(false);
  });
});

// ============ 공통 ============

describe('R5: 군집 판정 반경', () => {
  it('반경 안이면 가장 가까운 군집, 밖이면 null', () => {
    const s = V_SCHOOLS[0];
    expect(nearestSchoolInRange(V_SCHOOLS, s.x + 10, s.y - 10)?.id).toBe(s.id);
    expect(nearestSchoolInRange(V_SCHOOLS, V_SPAWN.x, V_SPAWN.y)).toBeNull();
    expect(nearestSchoolInRange(O_SCHOOLS, O_SPAWN.x, O_SPAWN.y)).toBeNull();
  });
});

describe('거점 시설 히트테스트 (R1~R3b)', () => {
  it('집/항구 각 시설 중심 클릭 → 해당 시설', () => {
    for (const f of HOME_FURNITURE) {
      expect(furnitureAt('home', f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
    }
    for (const f of HARBOR_FURNITURE) {
      expect(furnitureAt('harbor', f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
    }
  });
  it('여객선은 항구에만 있다', () => {
    expect(HARBOR_FURNITURE.some(f => f.id === 'travel')).toBe(true);
    expect(HOME_FURNITURE.some(f => f.id === 'travel')).toBe(false);
  });
  it('빈 공간은 null', () => {
    expect(furnitureAt('home', 160, 40)).toBeNull();
  });
});
