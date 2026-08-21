// R4, R4b: 지역 충돌·군집 배치·경로 무결성 
// 공통 무결성은 REGION_PACKS를 순회한다 — 새 지역을 등록하면 자동으로 검증 대상이 된다.
// 고정 좌표 회귀 검증(마을/대양 세부)은 지역별 describe에 유지.
import { describe, it, expect } from 'vitest';
import {
  CAST_RANGE, REGION_PACKS, canMove, zoneAt, movePlayer, inTrigger, nearestSchoolInRange,
  furnitureAt, HOME_FURNITURE, HARBOR_FURNITURE,
  VILLAGE, V_POND, V_HOUSE, V_DOOR, V_SPAWN, V_BRIDGE, V_PIER, V_PORT, V_SCHOOLS,
  V_BOATSHOP, V_BOATSHOP_TRIGGER,
  OCEAN, LANDS, TRENCH, O_DOCK, O_SPAWN, O_SCHOOLS,
} from './index';
import type { RegionPack, School } from './index';

// 시작점에서 BFS — 군집·트리거마다 도달 가능한 칸이 있는지 검증
function reachabilityCheck(pack: RegionPack) {
  const STEP = 4;
  const cols = Math.ceil(pack.w / STEP), rows = Math.ceil(pack.h / STEP);
  const key = (cx: number, cy: number) => cy * cols + cx;
  const visited = new Uint8Array(cols * rows);
  const queue: [number, number][] = [[Math.round(pack.spawn.x / STEP), Math.round(pack.spawn.y / STEP)]];
  visited[key(queue[0][0], queue[0][1])] = 1;
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (visited[key(nx, ny)]) continue;
      if (!canMove(pack, nx * STEP, ny * STEP)) continue;
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
  const reachedRect = (r: { x: number; y: number; w: number; h: number }) => {
    for (let cx = Math.floor(r.x / STEP); cx <= Math.floor((r.x + r.w - 1) / STEP); cx++) {
      for (let cy = Math.floor(r.y / STEP); cy <= Math.floor((r.y + r.h - 1) / STEP); cy++) {
        if (visited[key(cx, cy)]) return true;
      }
    }
    return false;
  };
  return { reachableNear, reachedRect };
}

// ============ 공통 무결성 — 모든 지역 팩 자동 검증 (R4b) ============

describe.each(Object.values(REGION_PACKS))('$id R4b: 레벨디자인 무결성 (팩 공통)', pack => {
  it('군집은 자기 수역 위에 있다', () => {
    for (const s of pack.schools) {
      expect(zoneAt(pack, s.x, s.y), s.id).toBe(s.spot);
      if (pack.movement === 'sail') expect(canMove(pack, s.x, s.y), s.id).toBe(true);
    }
  });

  it('시작점은 이동 가능한 곳이고 어떤 트리거 안도 아니다', () => {
    expect(canMove(pack, pack.spawn.x, pack.spawn.y)).toBe(true);
    for (const trig of pack.triggers) {
      expect(inTrigger(pack.spawn, trig.rect), trig.action).toBe(false);
    }
  });

  it('모든 군집·트리거는 시작점에서 도달 가능 (BFS)', () => {
    const { reachableNear, reachedRect } = reachabilityCheck(pack);
    for (const s of pack.schools) {
      expect(reachableNear(s), `${s.id}에 닿을 자리가 없음`).toBe(true);
    }
    for (const trig of pack.triggers) {
      expect(reachedRect(trig.rect), `${trig.action} 트리거로 가는 길이 막혀 있음`).toBe(true);
    }
  });
});

// ============ 지역 1: 마을 — 고정 좌표 회귀 ============

describe('마을 R4: 충돌 (도보)', () => {
  it('땅은 걷고 물은 못 걷는다', () => {
    expect(canMove(VILLAGE, V_SPAWN.x, V_SPAWN.y)).toBe(true);
    expect(canMove(VILLAGE, 150, 120)).toBe(false); // 연못
    expect(canMove(VILLAGE, 400, 220)).toBe(false); // 강
    expect(canMove(VILLAGE, 100, 330)).toBe(false); // 남쪽 바다
    expect(canMove(VILLAGE, V_HOUSE.x + 10, V_HOUSE.y + 10)).toBe(false); // 집
  });

  it('다리와 포구 부두는 물 위에서도 걷는다', () => {
    expect(canMove(VILLAGE, V_BRIDGE.x + 10, 220)).toBe(true);  // 강 위 다리
    expect(canMove(VILLAGE, V_PIER.x + 8, 330)).toBe(true);     // 바다 위 부두
  });

  it('수역 판정: 연못/강만 낚시 수역, 남쪽 바다는 아님', () => {
    expect(zoneAt(VILLAGE, 150, 120)).toBe('pond');
    expect(zoneAt(VILLAGE, 400, 220)).toBe('river');
    expect(zoneAt(VILLAGE, 100, 330)).toBeNull(); // 낚시 수역 아님(경계 바다)
    expect(zoneAt(VILLAGE, V_SPAWN.x, V_SPAWN.y)).toBeNull();
  });

  it('연못으로 걸으면 막히고, 물가를 따라 미끄러진다', () => {
    let pos = { x: 106, y: 120 }; // 연못 서쪽 물가
    expect(canMove(VILLAGE, pos.x, pos.y)).toBe(true);
    for (let i = 0; i < 40; i++) pos = movePlayer(VILLAGE, pos, 1, 0, 0.05, 75);
    expect(canMove(VILLAGE, pos.x, pos.y)).toBe(true);
    expect(pos.x).toBeLessThan(V_POND.x);
    let slid = { x: 106, y: 120 };
    for (let i = 0; i < 10; i++) slid = movePlayer(VILLAGE, slid, 1, 1, 0.05, 75);
    expect(slid.y).toBeGreaterThan(120);
    expect(canMove(VILLAGE, slid.x, slid.y)).toBe(true);
  });
});

describe('마을 트리거', () => {
  it('집 문/포구 트리거 좌표', () => {
    expect(inTrigger({ x: V_DOOR.x + 10, y: V_DOOR.y + 4 }, V_DOOR)).toBe(true);
    expect(inTrigger({ x: V_PORT.x + 8, y: V_PORT.y + 6 }, V_PORT)).toBe(true);
  });

  it('목공소: 건물은 충돌체, 문 앞 트리거는 걸을 수 있는 땅 위', () => {
    expect(canMove(VILLAGE, V_BOATSHOP.x + 10, V_BOATSHOP.y + 10)).toBe(false); // 건물 통과 불가
    const tc = { x: V_BOATSHOP_TRIGGER.x + 4, y: V_BOATSHOP_TRIGGER.y + 10 };
    expect(canMove(VILLAGE, tc.x, tc.y)).toBe(true);            // 트리거 지점은 접근 가능
    expect(inTrigger(tc, V_BOATSHOP_TRIGGER)).toBe(true);
    // 필드 트리거 연결: 마을엔 shop 트리거가 있고, 대양엔 없다(조선소는 항구 안)
    expect(VILLAGE.triggers.find(t => t.action === 'shop')?.rect).toBe(V_BOATSHOP_TRIGGER);
    expect(OCEAN.triggers.some(t => t.action === 'shop')).toBe(false);
  });
});

// ============ 지역 2: 대양 — 고정 좌표 회귀 ============

describe('대양 R4: 충돌 (항해)', () => {
  it('열린 바다는 항해 가능, 대륙/경계는 불가', () => {
    expect(canMove(OCEAN, O_SPAWN.x, O_SPAWN.y)).toBe(true);
    expect(canMove(OCEAN, 500, 100)).toBe(true);
    expect(canMove(OCEAN, 700, 450)).toBe(true);
    for (const l of LANDS) {
      expect(canMove(OCEAN, l.x + l.w / 2, l.y + l.h / 2), l.name ?? `${l.x},${l.y}`).toBe(false);
    }
    expect(canMove(OCEAN, -5, 100)).toBe(false);
    expect(canMove(OCEAN, 100, 545)).toBe(false);
  });

  it('해역 판정: 해구 안=deep, 밖=sea', () => {
    expect(zoneAt(OCEAN, TRENCH.x + 10, TRENCH.y + 10)).toBe('deep');
    expect(zoneAt(OCEAN, 100, 100)).toBe('sea');
  });
});

describe('대양 트리거', () => {
  it('접안 트리거는 항해 가능한 물 위', () => {
    const dc = { x: O_DOCK.x + O_DOCK.w / 2, y: O_DOCK.y + O_DOCK.h / 2 };
    expect(inTrigger(dc, O_DOCK)).toBe(true);
    expect(canMove(OCEAN, dc.x, dc.y)).toBe(true);
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
