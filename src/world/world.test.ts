// R4, R4b: 지역 충돌·군집 배치·경로 무결성 
// 공통 무결성은 REGION_PACKS를 순회한다 — 새 지역을 등록하면 자동으로 검증 대상이 된다.
// 고정 좌표 회귀 검증(마을/대양 세부)은 지역별 describe에 유지.
import { describe, it, expect } from 'vitest';
import { compileMap } from './mask';
import { SPOTS } from '../data/spots';
import { WATER_STYLE } from '../pixel/styles';
import type { MapCellDef, RegionPack, School } from './index';
import {
  CAST_RANGE, REGION_PACKS, canMove, zoneAt, movePlayer, inTrigger, nearestSchoolInRange,
  entryPoint, furnitureAt, HOME_FURNITURE, HARBOR_FURNITURE, MANILA_FURNITURE, COLOMBO_FURNITURE,
  VILLAGE, V_POND, V_HOUSE, V_DOOR, V_SPAWN, V_BRIDGE, V_PIER, V_PORT, V_SCHOOLS,
  V_BOATSHOP, V_BOATSHOP_TRIGGER,
  OCEAN, O_DOCK, O_SPAWN, O_SCHOOLS, O_EXIT, OCEAN_W, OCEAN_H,
  SEASIA, M_DOCK, M_SPAWN, LUZON_STRAIT, MALACCA_EXIT, SEASIA_W, SEASIA_H, SEASIA_SCHOOLS,
  INDIAN, C_DOCK, C_SPAWN, SUNDA_EXIT, INDIAN_W, INDIAN_H, INDIAN_SCHOOLS,
} from './index';
import { WINDOW as OCEAN_WINDOW } from './regions/generated/ocean.mask';
import { WINDOW as SEASIA_WINDOW } from './regions/generated/seasia.mask';
import { WINDOW as INDIAN_WINDOW } from './regions/generated/indian.mask';

type Window = { lonMin: number; lonMax: number; latMin: number; latMax: number };
/** 경위도 → 지역 픽셀 [x, y](generated 창 기준). 지리 좌표는 마스크 재생성과 무관하므로
 *  육지/수역 회귀 샘플은 픽셀 리터럴 대신 이 변환으로 기술한다. */
function geoPx(win: Window, w: number, h: number, lon: number, lat: number): [number, number] {
  return [
    Math.round(((lon - win.lonMin) / (win.lonMax - win.lonMin)) * w),
    Math.round(((win.latMax - lat) / (win.latMax - win.latMin)) * h),
  ];
}
const oceanAt = (lon: number, lat: number) => geoPx(OCEAN_WINDOW, OCEAN_W, OCEAN_H, lon, lat);
const seasiaAt = (lon: number, lat: number) => geoPx(SEASIA_WINDOW, SEASIA_W, SEASIA_H, lon, lat);
const indianAt = (lon: number, lat: number) => geoPx(INDIAN_WINDOW, INDIAN_W, INDIAN_H, lon, lat);


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
      if (def.land) expect(def.spot ?? null, `육지 정의에 spot ${def.spot}`).toBeNull();
      if (def.style) expect(WATER_STYLE[def.style], `없는 물 스타일 ${def.style}`).toBeDefined();
    }
  });

  it('낚시 수역은 충분한 면적을 유지한다 (육지가 덮어 삼켜지지 않았나)', () => {
    if (!pack.map) { // rect 지형 — 조각 존재만 확인
      for (const s of pack.schools) {
        expect(pack.terrain!.some(t => t.kind === 'water' && t.spot === s.spot), s.spot).toBe(true);
      }
      return;
    }
    for (const spot of new Set(pack.schools.map(s => s.spot))) {
      let cells = 0;
      for (const code of pack.map.codes) {
        if (pack.map.palette[code]?.spot === spot) cells++;
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
    expect(canMove(OCEAN, ...oceanAt(140, 22)), '열린 태평양').toBe(true);
    expect(canMove(OCEAN, ...oceanAt(152, 30)), '북서 태평양').toBe(true);
    // 육지 샘플 — 경위도 고정이라 마스크 재생성과 무관하게 육지여야 한다
    expect(canMove(OCEAN, ...oceanAt(121.5, 31)), '중국 연해').toBe(false);
    expect(canMove(OCEAN, ...oceanAt(127.5, 37)), '한반도').toBe(false);
    expect(canMove(OCEAN, ...oceanAt(137, 36)), '혼슈').toBe(false);
    expect(canMove(OCEAN, -5, 100)).toBe(false);
    expect(canMove(OCEAN, 100, OCEAN_H - 3)).toBe(false);
  });

  it('해역 판정: 해구 안=deep, 밖=sea', () => {
    expect(zoneAt(OCEAN, ...oceanAt(145.5, 21.5)), '해구 중심').toBe('deep');
    expect(zoneAt(OCEAN, ...oceanAt(140, 22)), '해구 밖 열린 바다').toBe('sea');
  });
});

describe('대양 트리거', () => {
  it('접안 트리거는 항해 가능한 물 위', () => {
    const dc = { x: O_DOCK.x + O_DOCK.w / 2, y: O_DOCK.y + O_DOCK.h / 2 };
    expect(inTrigger(dc, O_DOCK)).toBe(true);
    expect(canMove(OCEAN, dc.x, dc.y)).toBe(true);
  });

  it('남쪽 출구(루손 해협)는 항해 가능한 물 위이고 동남아로 통한다', () => {
    const ec = { x: O_EXIT.x + O_EXIT.w / 2, y: O_EXIT.y + 2 };
    expect(canMove(OCEAN, ec.x, ec.y)).toBe(true);
    const travel = OCEAN.triggers.find(t => t.action === 'travel');
    assertTravel(travel);
    expect(travel.to).toBe('seasia');
    expect(travel.requiredBoat).toBe(3);
  });
});

// ============ 지역 1-2: 동남아&오세아니아 — 고정 좌표 회귀 ============

describe('동남아 R4: 충돌 (항해)', () => {
  it('열린 바다는 항해 가능, 육지/경계는 불가', () => {
    expect(canMove(SEASIA, M_SPAWN.x, M_SPAWN.y)).toBe(true);
    expect(canMove(SEASIA, ...seasiaAt(112, 13)), '남중국해 열린 바다').toBe(true);
    // 육지 샘플 — 경위도 고정이라 마스크 재생성과 무관하게 육지여야 한다
    expect(canMove(SEASIA, ...seasiaAt(104, 17)), '인도차이나 내륙').toBe(false);
    expect(canMove(SEASIA, ...seasiaAt(121, 16.5)), '루손').toBe(false);
    expect(canMove(SEASIA, ...seasiaAt(113.5, 0.5)), '보르네오').toBe(false);
    expect(canMove(SEASIA, ...seasiaAt(134, -25)), '호주').toBe(false);
    expect(canMove(SEASIA, -5, 100)).toBe(false);
    expect(canMove(SEASIA, 100, SEASIA_H - 3)).toBe(false);
  });

  it('해역 판정: 특화 수역 3개는 각자의 물, 열린 바다는 낚시 불가(null)', () => {
    const dh = SEASIA_SCHOOLS.find(s => s.id === 'sea-dh-1')!;
    const cw = SEASIA_SCHOOLS.find(s => s.id === 'sea-cw-1')!;
    const br1 = SEASIA_SCHOOLS.find(s => s.id === 'sea-br-1')!;
    const br2 = SEASIA_SCHOOLS.find(s => s.id === 'sea-br-2')!;
    expect(zoneAt(SEASIA, dh.x, dh.y), '드래곤 홀').toBe('dragonhole');
    expect(zoneAt(SEASIA, cw.x, cw.y), '코론 침선').toBe('coron');
    expect(zoneAt(SEASIA, br1.x, br1.y), '리프 밴드 북단').toBe('barrierreef');
    // 리프 밴드의 마지막 조각도 같은 수역이다 (다중 조각 spot 공유 회귀)
    expect(zoneAt(SEASIA, br2.x, br2.y), '리프 밴드 남단').toBe('barrierreef');
    // 일반 수역 폐지 — 열린 바다는 통행 전용이다.
    expect(zoneAt(SEASIA, M_SPAWN.x, M_SPAWN.y)).toBeNull();
    expect(zoneAt(SEASIA, ...seasiaAt(112, 13))).toBeNull();
  });
});

describe('동남아 트리거', () => {
  it('접안 트리거는 마닐라항 건물 아래 물 위', () => {
    const dc = { x: M_DOCK.x + M_DOCK.w / 2, y: M_DOCK.y + M_DOCK.h / 2 };
    expect(inTrigger(dc, M_DOCK)).toBe(true);
    expect(canMove(SEASIA, dc.x, dc.y)).toBe(true);
  });

  it('출구는 둘 — 루손 해협(태평양 복귀, 게이트 없음)과 말라카 해협(인도양, 배5)', () => {
    const travels = SEASIA.triggers.filter(t => t.action === 'travel');
    expect(travels).toHaveLength(2);
    const luzon = travels.find(t => t.to === 'ocean')!;
    const malacca = travels.find(t => t.to === 'indian')!;
    expect(luzon.requiredBoat).toBe(0);
    expect(malacca.requiredBoat).toBe(5); // 1-2 동남아를 건너뛰려면 tier5(원양어선) — 사용자 확정
    assertTravel(luzon); assertTravel(malacca);
    expect(inTrigger({ x: LUZON_STRAIT.x + LUZON_STRAIT.w / 2, y: LUZON_STRAIT.y + LUZON_STRAIT.h / 2 },
      LUZON_STRAIT)).toBe(true);
    expect(inTrigger({ x: MALACCA_EXIT.x + MALACCA_EXIT.w / 2, y: MALACCA_EXIT.y + MALACCA_EXIT.h / 2 },
      MALACCA_EXIT)).toBe(true);
    // 말라카 라벨은 예고가 아니라 방향 안내로 갱신됐다 (1-3 개항)
    expect(SEASIA.labels.some(l => l.text.includes('말라카'))).toBe(true);
  });
});

function assertTravel(t: import('./index').TriggerDef | undefined): asserts t is
  Extract<import('./index').TriggerDef, { action: 'travel' }> {
  expect(t?.action).toBe('travel');
}

// ============ R5c: 경계 봉합 입장점 (오픈월드) ============

describe('R5c: entryPoint — 경계 봉합 입장', () => {
  const travel = (rect: { x: number; y: number; w: number; h: number }, edge: 'top' | 'bottom' | 'left' | 'right'): import('./index').TriggerDef =>
    ({ rect, action: 'travel', to: 'ocean', requiredBoat: 0, msg: '', blockedMsg: '',
       entry: { edge } });

  it('실전 팩: 태평양 남쪽에서 건너면 동남아 북쪽에서 x를 보존해 등장한다', () => {
    const trig = OCEAN.triggers.find(t => t.action === 'travel')!;
    assertTravel(trig);
    for (const fromX of [480, 800]) {         // 북단이 열린 물인 열 (중국 대륙 동쪽)
      const p = entryPoint(SEASIA, trig, { x: fromX, y: 729 });
      expect(p.x).toBe(fromX);                       // 벗어난 자리 그대로
      expect(p.y).toBeLessThan(40);                  // 마주 보는(북쪽) 가장자리 안쪽
      expect(canMove(SEASIA, p.x, p.y)).toBe(true);  // 바다 위
    }
  });



  it('입장 열이 육지로 막혔으면 첫 통행 가능한 자리로 밀린다 (인공 팩)', () => {
    // 인공 팩(마스크) — 북서쪽 120×30px 육지
    const mini: RegionPack = {
      id: 'ocean', name: '', base: 'home',
      info: { shortName: '', tagline: '', lore: '', tips: [], controls: [] },
      w: 200, h: 200, movement: 'sail',
      map: compileMap(8, 11, { '.': {}, L: { land: true } }, [
        'LLLLLLLLLLLLLLL..........',
        'LLLLLLLLLLLLLLL..........',
        'LLLLLLLLLLLLLLL..........',
        'LLLLLLLLLLLLLLL..........',
        ...Array.from({ length: 21 }, () => '.........................'),
      ]),
      waveCount: 0,
      buildings: [], decorations: [], schools: [], spawn: { x: 100, y: 100 },
      triggers: [travel({ x: 0, y: 192, w: 200, h: 8 }, 'top')],
      labels: [],
    };
    const p = entryPoint(mini, mini.triggers[0], { x: 20, y: 196 });
    expect(p.x).toBeGreaterThanOrEqual(120);         // 육지(c<15) 동쪽 첫 칸
    expect(canMove(mini, p.x, p.y)).toBe(true);
  });

  it('되돌아 나오는 출구 트리거 위에는 착지하지 않는다 (재발화 방지)', () => {
    const p = entryPoint(SEASIA, SEASIA.triggers.find(t => t.action === 'travel')!,
      { x: 700, y: 8 });
    for (const t of SEASIA.triggers) {
      expect(inTrigger(p, t.rect), `${t.action} 트리거 위 착지`).toBe(false);
    }
  });

  it('entry 없는 트리거는 스폰을 돌려준다 (거점 항로 기존 계약)', () => {
    const dock = OCEAN.triggers[0];
    expect(dock.action).toBe('base');
    expect(entryPoint(OCEAN, dock, { x: 300, y: 190 })).toEqual(O_SPAWN);
  });

  it('실전 팩(좌우 봉합): 인도양 동쪽에서 건너면 동남아 서쪽에서 y를 보존해 등장한다', () => {
    const trig = INDIAN.triggers.find(t => t.action === 'travel')!;
    assertTravel(trig);
    for (const fromY of [200, 600, 760]) {   // 서단이 열린 물인 행들 (SEASIA_H=825 이내)
      const p = entryPoint(SEASIA, trig, { x: INDIAN_W - 8, y: fromY });
      expect(p.y).toBe(fromY);                       // 벗어난 자리 그대로 (y 보존 — left/right 축)
      expect(p.x).toBeLessThan(40);                  // 마주 보는(서쪽) 가장자리 안쪽
      expect(canMove(SEASIA, p.x, p.y)).toBe(true);  // 바다 위
    }
  });
});

// ============ 지역 1-3: 인도양 — 고정 좌표 회귀 ============

describe('인도양 R4: 충돌 (항해)', () => {
  it('열린 바다는 항해 가능, 육지/경계는 불가', () => {
    expect(canMove(INDIAN, C_SPAWN.x, C_SPAWN.y)).toBe(true);
    expect(canMove(INDIAN, ...indianAt(65, 12)), '아라비아해 열린 바다').toBe(true);
    expect(canMove(INDIAN, ...indianAt(88, -15)), '동인도양').toBe(true);
    // 육지 샘플 — 경위도 고정이라 마스크 재생성과 무관하게 육지여야 한다
    expect(canMove(INDIAN, ...indianAt(47, 24)), '아라비아 반도').toBe(false);
    expect(canMove(INDIAN, ...indianAt(77.5, 8.5)), '인도 남단').toBe(false);
    expect(canMove(INDIAN, ...indianAt(46.5, -19.5)), '마다가스카르').toBe(false);
    expect(canMove(INDIAN, ...indianAt(102, -2.2)), '수마트라').toBe(false);
    expect(canMove(INDIAN, -5, 100)).toBe(false);
    expect(canMove(INDIAN, 100, INDIAN_H - 3)).toBe(false);
  });

  it('해역 판정: 남인도양 안=특화, 밖=연안 일반', () => {
    const s1 = INDIAN_SCHOOLS.find(s => s.id === 'ind-s-1')!;
    const i1 = INDIAN_SCHOOLS.find(s => s.id === 'ind-i-1')!;
    expect(zoneAt(INDIAN, s1.x, s1.y), '남인도양 군집').toBe('southindian');
    expect(zoneAt(INDIAN, i1.x, i1.y), '연안 군집').toBe('indian');
    expect(zoneAt(INDIAN, C_SPAWN.x, C_SPAWN.y), '스폰 앞 열린 바다').toBe('indian');
  });
});

describe('인도양 트리거', () => {
  it('접안 트리거는 콜롬보 항 건물 아래 물 위', () => {
    const dc = { x: C_DOCK.x + C_DOCK.w / 2, y: C_DOCK.y + C_DOCK.h / 2 };
    expect(inTrigger(dc, C_DOCK)).toBe(true);
    expect(canMove(INDIAN, dc.x, dc.y)).toBe(true);
  });

  it('동쪽 출구(순다 방면)는 말라카 해협으로 통하고 배4 게이트다', () => {
    const ec = { x: SUNDA_EXIT.x + SUNDA_EXIT.w / 2, y: SUNDA_EXIT.y + SUNDA_EXIT.h / 2 };
    expect(canMove(INDIAN, ec.x, ec.y)).toBe(true);
    const travel = INDIAN.triggers.find(t => t.action === 'travel');
    assertTravel(travel);
    expect(travel.to).toBe('seasia');
    expect(travel.requiredBoat).toBe(0); // 후진 방향은 게이트 없음
    expect(travel.entry?.edge).toBe('left');
  });
});

// ============ 지역 이동 무한 루프 금지 (필수 게이트) ============
// 도착점(스폰·entryPoint 착지)이 시설 트리거(접안 등)의 최소 이격 거리 안이면,
// 착지 후 첫 이동에 즉시 재발화해 포탈 사이에 갇힌다(고향↔태평양 무한 접안 사건).
// travel 트리거는 봉합 회랑 특성상 스트립 쌍과 겹칠 수밖에 없어 제외한다 —
// 대신 착지가 트리거 '위'가 아닌 것은 R5c가 보증한다.

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
            ? { x: fx, y: trig.rect.y + trig.rect.h - 1 }  // 남쪽 출구로 건너 북쪽에서 입장
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
