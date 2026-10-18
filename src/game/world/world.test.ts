// R4, R4b: 지역 충돌·군집 배치·경로 무결성과 존 계층을 검증한다.
// 공통 무결성은 REGION_PACKS를 순회한다 — 새 지역을 등록하면 자동으로 검증 대상이 된다.
import { describe, it, expect } from 'vitest';
import { SPOTS } from '../content/spots';
import { ZONES, zoneById, zoneOfSpot } from '../content/zones';
import { WATER_STYLE } from '../rendering/pixel/styles';
import type { MapCellDef, RegionPack, School } from './index';
import {
  REGION_PACKS, BASE_PACKS, ZoneTracker, canMove, zoneOf, movePlayer, inTrigger, nearestSchoolInRange,
  entryPoint, furnitureAt, HOME_FURNITURE, HARBOR_FURNITURE, MANILA_FURNITURE, COLOMBO_FURNITURE,
  TOAMASINA_FURNITURE,
  VILLAGE, VILLAGE_W, V_POND, V_HOUSE, V_DOOR, V_SPAWN, V_BRIDGE, V_PIER, V_PORT, V_SCHOOLS,
  WORLD, WORLD_SPAWN, WORLD_W, WORLD_H, schoolsOf, generateWorldSchools,
} from './index';
import { CAST_RANGE } from '../rules/balance';
import { WINDOW as WORLD_WINDOW, ANCHORS as WORLD_ANCHORS } from './regions/generated/world.mask';
import { EARTH_MAP, worldToEarth, implementedRect } from '../../presentation/views/overlays/world-map/atlas';

// 대양 어군은 날짜 시드 배치다 — 팩 공통 검증은 고정 날짜 하나로, 도달 가능성은 여러 날로 본다
const TEST_DAY = '2026-10-18';
const SCHOOL_DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-12-31', '2027-03-01'];
const schoolsFor = (pack: RegionPack): School[] => schoolsOf(pack.id, TEST_DAY);

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
    for (const s of schoolsFor(pack)) {
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
    expect(nearestSchoolInRange(schoolsFor(pack), pack.spawn.x, pack.spawn.y, CAST_RANGE), pack.id).toBeNull();
  });

  it('모든 군집·트리거는 시작점에서 도달 가능 (BFS)', () => {
    const { reachableNear, reachedRect } = reachabilityCheck(pack);
    for (const s of schoolsFor(pack)) {
      expect(reachableNear(s), `${s.id}에 닿을 자리가 없음`).toBe(true);
    }
    for (const trig of pack.triggers) {
      expect(reachedRect(trig.rect), `${trig.action} 트리거로 가는 길이 막혀 있음`).toBe(true);
    }
  });
});

// ============ 마스크 정합성 — 지형·수역 작성 실수 감시 ============

describe('대양 어군 — 날짜가 바뀌어도 시작점에서 바다로 닿는다 (BFS)', () => {
  it.each(SCHOOL_DAYS)('%s', day => {
    const { reachableNear } = reachabilityCheck(WORLD);
    for (const s of generateWorldSchools(day)) {
      expect(reachableNear(s), `${day} ${s.id}에 닿을 자리가 없음`).toBe(true);
    }
  });
});

describe.each(Object.values(REGION_PACKS))('$id 마스크 정합성', pack => {
  it('군집 spot은 실제 수역 데이터에 있다', () => {
    for (const s of schoolsFor(pack)) {
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
      for (const s of schoolsFor(pack)) {
        expect(pack.terrain!.some(t => t.kind === 'water'), s.spot).toBe(true);
      }
      return;
    }
    for (const spot of new Set(schoolsFor(pack).map(s => s.spot))) {
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
    expect(canMove(VILLAGE, 214, 120)).toBe(false); // 연못
    expect(canMove(VILLAGE, 250, 220)).toBe(false); // 강
    expect(canMove(VILLAGE, 100, 330)).toBe(false); // 남쪽 바다
    expect(canMove(VILLAGE, V_HOUSE.x + 10, V_HOUSE.y + 10)).toBe(false); // 집
  });

  it('다리와 포구 부두는 물 위에서도 걷는다', () => {
    expect(canMove(VILLAGE, V_BRIDGE.x + 10, 220)).toBe(true);  // 강 위 다리
    expect(canMove(VILLAGE, V_PIER.x + 8, 330)).toBe(true);     // 바다 위 부두
  });

  it('존 판정: 마을 전체가 village 존', () => {
    expect(zoneOf(VILLAGE, 214, 120)).toBe('village');
    expect(zoneOf(VILLAGE, 250, 220)).toBe('village');
    expect(zoneOf(VILLAGE, 100, 330)).toBe('village');
    expect(zoneOf(VILLAGE, V_SPAWN.x, V_SPAWN.y)).toBe('village');
  });

  it('연못으로 걸으면 막히고, 물가를 따라 미끄러진다', () => {
    let pos = { x: 170, y: 120 }; // 연못 서쪽 물가
    expect(canMove(VILLAGE, pos.x, pos.y)).toBe(true);
    for (let i = 0; i < 40; i++) pos = movePlayer(VILLAGE, pos, 1, 0, 0.05, 75);
    expect(canMove(VILLAGE, pos.x, pos.y)).toBe(true);
    expect(pos.x).toBeLessThan(V_POND.x);
    let slid = { x: 170, y: 120 };
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

  it('필드에는 상점 트리거가 없다 — 배 구매는 집의 목공소에서 한다', () => {
    expect(VILLAGE.triggers.map(t => t.action).sort()).toEqual(['base', 'travel']);
    expect(VILLAGE.buildings.map(b => b.sprite)).toEqual(['house']);
  });
});

describe('마을 지형 — 화면 한 장 너비', () => {
  it('너비는 필드 화면 한 장(448)이고 모든 어군·장식·지형이 그 안에 있다', () => {
    expect(VILLAGE_W).toBe(448);
    for (const s of V_SCHOOLS) expect(s.x).toBeLessThan(VILLAGE_W);
    for (const d of VILLAGE.decorations) expect(d.x).toBeLessThan(VILLAGE_W);
    for (const t of VILLAGE.terrain ?? []) expect(t.rect.x + t.rect.w).toBeLessThanOrEqual(VILLAGE_W);
  });
  it('다리·부두·출항 지점은 가로 가운데에 있다', () => {
    for (const r of [V_BRIDGE, V_PIER, V_PORT]) expect(r.x + r.w / 2).toBe(VILLAGE_W / 2);
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
    for (const day of SCHOOL_DAYS) {
      for (const s of generateWorldSchools(day)) {
        expect(zoneOf(WORLD, s.x, s.y), `${day} ${s.id}(${s.spot}) 존`).toBe(zoneOfSpot(s.spot));
      }
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

  it('마다가스카르 섬 동해안(50.5E)을 사이에 두고 인도양/마다가스카르 구역이 나뉜다', () => {
    expect(zoneOf(WORLD, ...worldAt(51.5, -20)), '섬 동쪽 바다').toBe('indian');
    expect(zoneOf(WORLD, ...worldAt(40.5, -20)), '모잠비크 해협').toBe('madagascar');
    expect(zoneOf(WORLD, ...worldAt(43.2, -13.6)), '코모로 심해').toBe('comorodeep');
  });

  it('구역 밖 물(내륙해 잉여)은 zone도 spot도 없다', () => {
    // 카스피 해 남부(창 안에 걸치는 대표 내륙수) — 통행은 가능해도 구역·낚시 대상이 아니다
    const at = worldAt(51, 39);
    if (canMove(WORLD, at[0], at[1])) { // 마스크 재생성에 따라 잉여 물의 존재는 변할 수 있다
      expect(zoneOf(WORLD, at[0], at[1])).toBeUndefined();
      for (const day of SCHOOL_DAYS) {
        expect(nearestSchoolInRange(generateWorldSchools(day), at[0], at[1], CAST_RANGE * 5), day).toBeNull();
      }
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
    expect(zoneById('madagascar')!.entryBoat).toBe(7);
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
    expect(countZone('madagascar'), '모잠비크 해협').toBeGreaterThan(0);
    expect(countZone('comorodeep'), '코모로 심해').toBeGreaterThan(0);
  });

  it('구현 영역 밖은 지구의 나머지다 — 대서양은 물, 아메리카는 육지, 어디도 구역이 없다', () => {
    const atl = earthAt2(-30, 30);       // 대서양 (미개척)
    expect(atl?.water ?? false).toBe(true);
    expect(atl?.zone).toBeUndefined();
    expect(earthAt2(-100, 45)?.land, '북아메리카').toBe(true);
    expect(earthAt2(20, 0)?.land ?? earthAt2(20, 0)?.water, '아프리카 해안은 정의돼 있다').toBeDefined();
  });

  it('구현 영역 rect는 world 마스크 크기와 스케일 일치한다 (16px/° × 122°×80°)', () => {
    const win = implementedRect();
    expect(win.w).toBeGreaterThanOrEqual(1948);
    expect(win.w).toBeLessThanOrEqual(1956);
    expect(win.h).toBeGreaterThanOrEqual(1274);
    expect(win.h).toBeLessThanOrEqual(1282);
  });

  it('worldToEarth — 항구 앵커가 구현 영역 안에 뜬다', () => {
    const win = implementedRect();
    for (const a of [WORLD_ANCHORS.harbor, WORLD_ANCHORS.manila, WORLD_ANCHORS.colombo, WORLD_ANCHORS.toamasina]) {
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

  it('이 지역으로 나오는 모든 거점의 출항 지점(exitAt)도 물 위이고 시설 트리거에서 최소 이격 거리 밖이다', () => {
    // 출항 지점이 접안 트리거에 닿아 있으면 나오자마자 다시 접안해 항구에 갇힌다(투아마시나항)
    for (const base of Object.values(BASE_PACKS)) {
      if (base.region !== pack.id || !base.exitAt) continue;
      expect(canMove(pack, base.exitAt.x, base.exitAt.y), `${base.id} 출항 지점이 육지`).toBe(true);
      expect(nearFacilityTrigger(base.exitAt), `${base.id} 출항 지점이 시설 트리거 인접`).toBe(false);
      // 출항하자마자 구역 경계 판정이 끼어들지 않게 — 접안한 자리와 같은 구역에서 나온다
      const dock = pack.triggers.find(t => t.action === 'base' && t.base === base.id);
      if (dock) {
        const center = { x: dock.rect.x + dock.rect.w / 2, y: dock.rect.y + dock.rect.h / 2 };
        expect(zoneOf(pack, base.exitAt.x, base.exitAt.y), `${base.id} 출항 지점의 구역`)
          .toBe(zoneOf(pack, center.x, center.y));
      }
    }
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
    expect(nearestSchoolInRange(V_SCHOOLS, s.x + 10, s.y - 10, CAST_RANGE)?.id).toBe(s.id);
    expect(nearestSchoolInRange(V_SCHOOLS, V_SPAWN.x, V_SPAWN.y, CAST_RANGE)).toBeNull();
    for (const day of SCHOOL_DAYS) {
      expect(nearestSchoolInRange(generateWorldSchools(day), WORLD_SPAWN.x, WORLD_SPAWN.y, CAST_RANGE), day)
        .toBeNull();
    }
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
    for (const f of TOAMASINA_FURNITURE) {
      expect(furnitureAt('toamasina', f.x + f.w / 2, f.y + f.h / 2)?.id).toBe(f.id);
    }
  });
  it('여객선은 항구에만 있다', () => {
    expect(HARBOR_FURNITURE.some(f => f.id === 'travel')).toBe(true);
    expect(HOME_FURNITURE.some(f => f.id === 'travel')).toBe(false);
  });
  it('시설 순서 — 집과 항구의 메뉴 구성', () => {
    const ids = (id: keyof typeof BASE_PACKS) => BASE_PACKS[id].furniture.map(f => f.id);
    expect(ids('home')).toEqual(['rank', 'rod', 'boat', 'sell', 'exit']);
    const port = ['rank', 'bounty', 'rod', 'boat', 'sell', 'travel', 'exit'];
    expect(ids('harbor')).toEqual(port);
    expect(ids('manila')).toEqual(port);
    expect(ids('toamasina')).toEqual(port);
    // 향료전(미끼)은 공방·조선소·어시장 다음에 둔다
    expect(ids('colombo')).toEqual(['rank', 'bounty', 'rod', 'boat', 'sell', 'shop', 'travel', 'exit']);
  });
  it('같은 거점 안의 시설 영역은 서로 겹치지 않는다', () => {
    for (const pack of Object.values(BASE_PACKS)) {
      const fs = pack.furniture;
      for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i], b = fs[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${pack.id}: ${a.id}·${b.id}`).toBe(false);
      }
    }
  });
  it('빈 공간은 null', () => {
    expect(furnitureAt('home', 160, 40)).toBeNull();
  });
});
