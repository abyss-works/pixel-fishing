// R4, R4b: 지역 충돌·군집 배치·경로 무결성 + 존 계층(spec/zone-tree.md)
// 공통 무결성은 REGION_PACKS를 순회한다 — 새 지역을 등록하면 자동으로 검증 대상이 된다.
import { describe, it, expect } from 'vitest';
import { SPOTS } from '../data/spots';
import { ZONES, zoneById, zoneOfSpot } from '../data/zones';
import { WATER_STYLE } from '../pixel/styles';
import type { MapCellDef, RegionPack, School } from './index';
import {
  CAST_RANGE, REGION_PACKS, ZoneTracker, canMove, zoneOf, movePlayer, inTrigger, nearestSchoolInRange,
  entryPoint, furnitureAt, HOME_FURNITURE, HARBOR_FURNITURE, MANILA_FURNITURE, COLOMBO_FURNITURE,
  VILLAGE, V_POND, V_HOUSE, V_DOOR, V_SPAWN, V_BRIDGE, V_PIER, V_PORT, V_SCHOOLS,
  V_BOATSHOP, V_BOATSHOP_TRIGGER,
  WORLD, WORLD_SPAWN, WORLD_SCHOOLS, WORLD_W, WORLD_H,
} from './index';
import { WINDOW as WORLD_WINDOW, ANCHORS as WORLD_ANCHORS } from './regions/generated/world.mask';
import { EARTH_MAP, worldToEarth, implementedRect } from '../pixel/scenes/atlas';

// 지형 파이프라인 스케일 — world.mask 기준 (32px/°)
const worldAt = (lon: number, lat: number): [number, number] => [
  Math.round((lon - WORLD_WINDOW.lonMin) / (WORLD_WINDOW.lonMax - WORLD_WINDOW.lonMin) * WORLD_W),
  Math.round((WORLD_WINDOW.latMax - lat) / (WORLD_WINDOW.latMax - WORLD_WINDOW.latMin) * WORLD_H),
];

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
  it('군집은 자기 존 위에 있다', () => {
    for (const s of pack.schools) {
      const cellZone = zoneOf(pack, s.x, s.y);
      const expected = zoneOfSpot(s.spot);
      expect(cellZone, `${s.id} 셀 구역`).toBe(expected);
      if (pack.movement === 'sail') expect(canMove(pack, s.x, s.y), s.id).toBe(true);
    }
  });

  it('시작점은 이동 가능한 곳이고 어떤 트리거 안도 아니다', () => {
    expect(canMove(pack, pack.spawn.x, pack.spawn.y)).toBe(true);
    for (const trig of pack.triggers) {
      expect(inTrigger(pack.spawn, trig.rect), trig.action).toBe(false);
    }
  });

  it('시작점에서 곧바로 캐스팅할 수 없다 (군집은 사거리 밖)', () => {
    expect(nearestSchoolInRange(pack.schools, pack.spawn.x, pack.spawn.y), pack.id).toBeNull();
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

// ============ 마스크 정합성 — 지형·수역 작성 실수 감시 ============

describe.each(Object.values(REGION_PACKS))('$id 마스크 정합성', pack => {
  it('군집 spot은 실제 수역 데이터에 있다', () => {
    for (const s of pack.schools) {
      expect(SPOTS.some(sp => sp.id === s.spot), `${pack.id}/${s.id} 알 수 없는 수역`).toBe(true);
    }
  });

  it('수역 정의는 물이어야 한다 — 육지와 겹치는 수역 정의 금지', () => {
    if (!pack.map) return;
    for (const def of mapPalette(pack.map)) {
      if (def.land) expect(def.zone ?? null, `육지 정의에 zone ${def.zone}`).toBeNull();
      if (def.style) expect(WATER_STYLE[def.style], `없는 물 스타일 ${def.style}`).toBeDefined();
    }
  });

  it('낚시 수역은 충분한 면적을 유지한다 (육지가 덮어 삼켜지지 않았나)', () => {
    if (!pack.map) { // rect 지형 — 조각 존재만 확인
      for (const s of pack.schools) {
        expect(pack.terrain!.some(t => t.kind === 'water'), s.spot).toBe(true);
      }
      return;
    }
    for (const spot of new Set(pack.schools.map(s => s.spot))) {
      let cells = 0;
      for (const code of pack.map.codes) {
        const def = pack.map.palette[code];
        if (def?.zone && zoneOfSpot(spot) === def.zone) cells++;
      }
      expect(cells, `${pack.id} ${spot}`).toBeGreaterThanOrEqual(24); // ≈ 24셀(1,536px²)
    }
  });
});

/** 컴파일된 팔레트 편집 (undefined 슬롯 제외) */
function mapPalette(map: NonNullable<RegionPack['map']>): NonNullable<MapCellDef>[] {
  return map.palette.filter((d): d is MapCellDef => !!d);
}

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

  it('존 판정: 마을 전체가 village 존', () => {
    expect(zoneOf(VILLAGE, 150, 120)).toBe('village');
    expect(zoneOf(VILLAGE, 400, 220)).toBe('village');
    expect(zoneOf(VILLAGE, 100, 330)).toBe('village');
    expect(zoneOf(VILLAGE, V_SPAWN.x, V_SPAWN.y)).toBe('village');
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
    expect(WORLD.triggers.some(t => t.action === 'shop')).toBe(false);
  });
});

// ============ 병합 바다(오픈월드) — 구역 경계·게이트 회귀 ============

describe('대양(병합) R4: 충돌 (항해)', () => {
  it('세 바다의 열린 물이 하나의 지도에서 항해 가능하다', () => {
    expect(canMove(WORLD, WORLD_SPAWN.x, WORLD_SPAWN.y)).toBe(true);
    expect(canMove(WORLD, ...worldAt(131.5, 31.5)), '태평양(고향 앞바다)').toBe(true);
    expect(canMove(WORLD, ...worldAt(112, 13)), '남중국해(동남아)').toBe(true);
    expect(canMove(WORLD, ...worldAt(65, 12)), '아라비아해(인도양)').toBe(true);
    // 육지 샘플 — 구 3지역 테스트의 경위도를 그대로 승격
    expect(canMove(WORLD, ...worldAt(127.5, 37)), '한반도').toBe(false);
    expect(canMove(WORLD, ...worldAt(134, -25)), '호주').toBe(false);
    expect(canMove(WORLD, ...worldAt(77.5, 8.5)), '인도 남단').toBe(false);
    expect(canMove(WORLD, -5, 100)).toBe(false);
    expect(canMove(WORLD, 100, WORLD_H - 3)).toBe(false);
  });

  it('수역 판정 — 군집이 모여 있는 곳의 존이 곧 수역이다 (존 계층 모델)', () => {
    // spot은 어군 오브젝트 — 좌표 → spot 매핑이 아니라 군집의 존 소속으로 확인한다 (R4b 공통)
    for (const s of WORLD_SCHOOLS) {
      expect(zoneOf(WORLD, s.x, s.y), `${s.id}(${s.spot}) 존`).toBe(zoneOfSpot(s.spot));
    }
  });
});

describe('대양(병합) 구역 경계 — zoneOf 좌표 판정', () => {
  it('루손 해협(19N)을 사이에 두고 태평양/동남아 구역이 나뉜다', () => {
    expect(zoneOf(WORLD, ...worldAt(130, 19.5)), '19N 북쪽').toBe('pacific');
    expect(zoneOf(WORLD, ...worldAt(130, 18.5)), '19N 남쪽').toBe('seasia');
  });

  it('말라카 해협(98.5E)을 사이에 두고 동남아/인도양 구역이 나뉜다', () => {
    expect(zoneOf(WORLD, ...worldAt(97.5, 2)), '해협 서쪽').toBe('indian');
    expect(zoneOf(WORLD, ...worldAt(99.5, 4)), '해협 동쪽').toBe('seasia');
  });

  it('구역 밖 물(내륙해 잉여)은 zone도 spot도 없다', () => {
    // 카스피 해 남부(창 안에 걸치는 대표 내륙수) — 통행은 가능해도 구역·낚시 대상이 아니다
    const at = worldAt(51, 39);
    if (canMove(WORLD, at[0], at[1])) { // 마스크 재생성에 따라 잉여 물의 존재는 변할 수 있다
      expect(zoneOf(WORLD, at[0], at[1])).toBeUndefined();
      expect(nearestSchoolInRange(WORLD_SCHOOLS, at[0], at[1], CAST_RANGE * 5)).toBeNull();
    }
  });

  it('모든 구역 소속 물 셀은 spots 데이터의 구역과 일치한다 (spot 불변 × zone 뷰 정합)', () => {
    const map = WORLD.map!;
    for (let r = 0; r < map.rows; r++) {
      for (let c = 0; c < map.cols; c++) {
        const def = map.palette[map.codes[r * map.cols + c]];
        if (!def || def.land) continue;
        if (def.zone) {
          const z = zoneById(def.zone)!;
          // 존 계층화 — 셀의 zone이 유효한 존 id인지만 확인 (spot은 셀에 없음)
          expect(z, `(${c},${r}) 알 수 없는 zone ${def.zone}`).toBeDefined();
        }
        // spot은 셀에 없음 — 어군 오브젝트로 분리됨 (zone-tree 모델)
      }
    }
  });

  it('게이트는 zones 데이터의 entryBoat를 따른다 (진입 방향 일괄)', () => {
    expect(zoneById('seasia')!.entryBoat).toBe(3);
    expect(zoneById('indian')!.entryBoat).toBe(5);
    for (const z of ZONES) {
      for (const sid of z.spots) expect(zoneOfSpot(sid)).toBe(z.id);
    }
  });
});

// ============ 구역 전이 추적기 — 즉시 게이트 × dwell 히스테리시스 (고도화 A-1·A-2) ============

describe('ZoneTracker — 게이트는 즉시, 표시 전환은 히스테리시스', () => {
  it('자격 미달 진입은 즉시 되밀기 + 구역 이름이 든 안내문', () => {
    const t = new ZoneTracker();
    t.init('pacific');
    const s = t.step('seasia', 0, 2); // boat 2 < entryBoat 3
    expect(s.revert).toBe(true);
    expect(s.blocked).toContain('동남아&오세아니아');
    // 같은 프레임에 다시 시도해도 같은 결과 (게이트는 상태를 소모하지 않는다)
    expect(t.step('seasia', 0, 2).revert).toBe(true);
  });

  it('자격이 되면 dwell(400ms) 후에야 "들어섰다"가 커밋된다', () => {
    const t = new ZoneTracker();
    t.init('pacific');
    expect(t.step('seasia', 0, 3).enteredTop).toBeNull();   // 통과 — 아직 커밋 아님
    expect(t.step('seasia', 399, 3).enteredTop).toBeNull(); // dwell 미달
    const s = t.step('seasia', 400, 3);
    expect(s.enteredTop).toBe('seasia');
  });

  it('dwell 중 경계에서 되돌아가면 커밋이 취소된다 — 로어·토스트 떨림 방지', () => {
    const t = new ZoneTracker();
    t.init('pacific');
    t.step('seasia', 0, 3);
    t.step('pacific', 100, 3);   // 되돌아감 — pending 취소
    expect(t.step('pacific', 5000, 3).enteredTop).toBeNull();
    // 이후 정상 재진입은 처음부터 다시 dwell을 채운다
    t.step('seasia', 5000, 3);
    expect(t.step('seasia', 5399, 3).enteredTop).toBeNull();
    expect(t.step('seasia', 5400, 3).enteredTop).toBe('seasia');
  });

  it('진입 후 게이트 검증은 커밋 전에도 새 구역 기준으로 쓴다 (인도양 5단계)', () => {
    const t = new ZoneTracker();
    t.init('seasia');
    // 동남아에 들어온 지 얼마 안 돼(커밋 전) 바로 인도양 경계로 — 게이트는 즉시 판정이다
    const s = t.step('indian', 10, 4); // boat 4 < 5
    expect(s.revert).toBe(true);
    expect(t.step('indian', 11, 5).revert).toBe(false); // 자격 되면 통과
  });

  it('구역 밖 물(null)은 전이로 치지 않는다 — 카스피 같은 잉여 물 통과가 상태를 흔들지 않는다', () => {
    const t = new ZoneTracker();
    t.init('indian');
    expect(t.step(null, 0, 6).enteredTop).toBeNull();
    expect(t.step(null, 5000, 6).enteredTop).toBeNull();
    // 게이트도 흔들리지 않는다 — 잉여 물에서 곧바로 태평양(게이트 없음)으로는 갈 수 없지만
    // 상태 기준은 여전히 indian이라 미달 배로 seasia 진입이 정상적으로 막힌다
    expect(t.step('seasia', 5001, 2).revert).toBe(true);
  });
});

// ============ 세계지도(earth) — 전지구 마스크·좌표 변환 ============

const earthPx = (lon: number, lat: number): [number, number] => {
  const w = EARTH_MAP.cols * EARTH_MAP.cellW, h = EARTH_MAP.rows * EARTH_MAP.cellH;
  return [Math.floor((lon + 180) / 360 * w), Math.floor((85 - lat) / 170 * h)];
};

describe('세계지도(earth) — 전지구 마스크와 좌표 변환', () => {
  const earthAt2 = (lon: number, lat: number) => {
    const [x, y] = earthPx(lon, lat);
    return EARTH_MAP.palette[
      EARTH_MAP.codes[Math.floor(y / EARTH_MAP.cellH) * EARTH_MAP.cols + Math.floor(x / EARTH_MAP.cellW)]];
  };

  it('extends 상속 — 구현 영역의 존 문자가 earth 마스크에도 찍혀 있다', () => {
    const countZone = (zone: string): number => {
      let n = 0;
      for (const code of EARTH_MAP.codes) {
        const d = EARTH_MAP.palette[code];
        if (d?.zone === zone) n++;
      }
      return n;
    };
    expect(countZone('pacific'), '태평양 열린 바다').toBeGreaterThan(0);
    expect(countZone('indian'), '인도양 연안').toBeGreaterThan(0);
    expect(countZone('deep'), '마리아나 해구·드래곤 홀').toBeGreaterThan(0);
    expect(countZone('coron'), '코론').toBeGreaterThan(0);
    expect(countZone('barrierreef'), '그레이트 배리어 리프').toBeGreaterThan(0);
    expect(countZone('southindian'), '남인도양').toBeGreaterThan(0);
  });

  it('구현 영역 밖은 지구의 나머지다 — 대서양은 물, 아메리카는 육지, 어디도 구역이 없다', () => {
    const atl = earthAt2(-30, 30);       // 대서양 (미개척)
    expect(atl?.water ?? false).toBe(true);
    expect(atl?.zone).toBeUndefined();
    expect(earthAt2(-100, 45)?.land, '북아메리카').toBe(true);
    expect(earthAt2(20, 0)?.land ?? earthAt2(20, 0)?.water, '아프리카 해안은 정의돼 있다').toBeDefined();
  });

  it('구현 영역 rect는 world 마스크 크기와 스케일 일치한다 (16px/° × 114°×80°)', () => {
    const win = implementedRect();
    expect(win.w).toBeGreaterThanOrEqual(1820);
    expect(win.w).toBeLessThanOrEqual(1828);
    expect(win.h).toBeGreaterThanOrEqual(1274);
    expect(win.h).toBeLessThanOrEqual(1282);
  });

  it('worldToEarth — 항구 앵커가 구현 영역 안에 뜬다', () => {
    const win = implementedRect();
    for (const a of [WORLD_ANCHORS.harbor, WORLD_ANCHORS.manila, WORLD_ANCHORS.colombo]) {
      const e = worldToEarth(a.x, a.y);
      expect(e.x, `lon anchor ${a.x}`).toBeGreaterThanOrEqual(win.x);
      expect(e.x).toBeLessThanOrEqual(win.x + win.w);
      expect(e.y).toBeGreaterThanOrEqual(win.y);
      expect(e.y).toBeLessThanOrEqual(win.y + win.h);
    }
  });

  it('worldToEarth 역변환이 닫힌다 — earth px → 경위도 → world px 원점 복원', () => {
    const roundTrip = (x: number, y: number): [number, number] => {
      const e = worldToEarth(x, y);
      const lon = -180 + e.x / (EARTH_MAP.cols * EARTH_MAP.cellW) * 360;
      const lat = 85 - e.y / (EARTH_MAP.rows * EARTH_MAP.cellH) * 170;
      const wx = (lon - WORLD_WINDOW.lonMin) / (WORLD_WINDOW.lonMax - WORLD_WINDOW.lonMin) * WORLD_W;
      const wy = (WORLD_WINDOW.latMax - lat) / (WORLD_WINDOW.latMax - WORLD_WINDOW.latMin) * WORLD_H;
      return [wx, wy];
    };
    const [rx, ry] = roundTrip(WORLD_SPAWN.x, WORLD_SPAWN.y);
    expect(Math.abs(rx - WORLD_SPAWN.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(ry - WORLD_SPAWN.y)).toBeLessThanOrEqual(1);
  });
});

// ============ 지역 이동 무한 루프 금지 (필수 게이트) ============
// 도착점(스폰·entryPoint 착지)이 시설 트리거(접안 등)의 최소 이격 거리 안이면,
// 착지 후 첫 이동에 즉시 재발화해 포탈 사이에 갇힌다(고향↔태평양 무한 접안 사건).

const TRIGGER_CLEARANCE = 8; // 일반 이동 속도(px/프레임)를 상회하는 최소 이격(px)

describe.each(Object.values(REGION_PACKS))('$id 지역 이동 게이트: 재발화 루프 금지', pack => {
  const nearFacilityTrigger = (p: { x: number; y: number }) => pack.triggers.some(t =>
    t.action !== 'travel' &&
    p.x >= t.rect.x - TRIGGER_CLEARANCE && p.x <= t.rect.x + t.rect.w + TRIGGER_CLEARANCE &&
    p.y >= t.rect.y - TRIGGER_CLEARANCE && p.y <= t.rect.y + t.rect.h + TRIGGER_CLEARANCE);

  it('스폰은 어떤 시설 트리거에서도 최소 이격 거리 밖이다', () => {
    expect(nearFacilityTrigger(pack.spawn), `${pack.id} 스폰이 시설 트리거 인접`).toBe(false);
  });

  it('모든 해상 입장 착지점(entryPoint)도 시설 트리거에서 최소 이격 거리 밖이다', () => {
    for (const src of Object.values(REGION_PACKS)) {
      for (const trig of src.triggers) {
        if (trig.action !== 'travel' || trig.to !== pack.id || !trig.entry) continue;
        for (let fx = trig.rect.x + 8; fx <= trig.rect.x + trig.rect.w - 8; fx += 16) {
          const from = trig.entry.edge === 'top'
            ? { x: fx, y: trig.rect.y + trig.rect.h - 1 }
            : { x: fx, y: trig.rect.y + 1 };
          const p = entryPoint(pack, trig, from);
          expect(nearFacilityTrigger(p), `${src.id}→${pack.id} ${fx}px 입장 착지점`).toBe(false);
        }
      }
    }
  });
});

// ============ 공통 ============

describe('R5: 군집 판정 반경', () => {
  it('반경 안이면 가장 가까운 군집, 밖이면 null', () => {
    const s = V_SCHOOLS[0];
    expect(nearestSchoolInRange(V_SCHOOLS, s.x + 10, s.y - 10)?.id).toBe(s.id);
    expect(nearestSchoolInRange(V_SCHOOLS, V_SPAWN.x, V_SPAWN.y)).toBeNull();
    expect(nearestSchoolInRange(WORLD_SCHOOLS, WORLD_SPAWN.x, WORLD_SPAWN.y)).toBeNull();
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
    for (const f of MANILA_FURNITURE) {
      expect(furnitureAt('manila', f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
    }
    for (const f of COLOMBO_FURNITURE) {
      expect(furnitureAt('colombo', f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
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
