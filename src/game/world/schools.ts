// 어군 배치 — 지역별 "지금의 어군" 단일 출처.
// 마을(연못·강)은 고정 어군이고, 대양은 날짜 시드로 절차 배치한다(사용자 확정 2026-10-18).
// 생성은 순수 함수다: 같은 날짜 문자열이면 어느 기기에서 계산해도 같은 배치가 나온다.
// 날짜(시드)는 boot 결과로 서버가 정하고 기능 계층이 세션 동안 보관한다 — 여기서는 모른다.
import type { SpotId } from '../content/spots';
import { ZONES, zoneGroup, zoneOfSpot } from '../content/zones';
import type { ZoneId } from '../content/zones';
import type { RegionId, Rect, School } from './types';
import { WORLD, WORLD_MAP } from './regions/world';
import { V_SCHOOLS } from './regions/village';

/** 해역별 어군 개수 범위 — 일반 해역(최상위 존의 스팟)과 특수 해역(하위 존의 스팟) */
export const GENERAL_SCHOOLS = { min: 7, max: 8 } as const;
export const SPECIAL_SCHOOLS = { min: 1, max: 2 } as const;

/** 어군 사이 최소 간격(px) = 캐스팅 판정 반경(CAST_RANGE 40)의 2.5배.
 *  두 어군이 한 캐스팅 반경에 함께 들어오지 않고(2배 초과), 마커 24px가 겹쳐 보이지 않는다.
 *  밸런스 상수를 여기서 import하면 층서(rules → world)가 뒤집히므로 값을 두고 테스트가 대조한다.
 *  항구 앞(스폰·접안 트리거) 여유로도 같은 값을 쓴다 — 접안 직후 바로 캐스팅되지 않게. */
export const SCHOOL_MIN_GAP = 100;

export function schoolsOf(region: RegionId, day: string): School[] {
  return region === 'village' ? V_SCHOOLS : worldSchools(day);
}

// ---------- 시드 난수 — 문자열 해시(FNV-1a) → mulberry32 ----------

function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 후보 칸 — 날짜와 무관한 지형 파생(1회 계산) ----------

/** 존별 후보 칸 인덱스(r*cols+c). 조건: 그 존의 물 칸 · 스폰에서 바다로 닿음 ·
 *  8방향 이웃에 육지 없음 · 항구 앞 여유 밖 · 건물 밖 */
let candidateCache: Map<ZoneId, number[]> | null = null;

function candidatesByZone(): Map<ZoneId, number[]> {
  if (candidateCache) return candidateCache;
  const map = WORLD_MAP;
  const { cols, rows, cellW, cellH } = map;
  const defAt = (c: number, r: number) =>
    c < 0 || r < 0 || c >= cols || r >= rows ? undefined : map.palette[map.codes[r * cols + c]];

  // 스폰에서 4방향 BFS — 물 칸만 통과. 내륙 호수처럼 바다와 끊긴 물을 제외한다.
  const reachable = new Uint8Array(cols * rows);
  const start = [Math.floor(WORLD.spawn.x / cellW), Math.floor(WORLD.spawn.y / cellH)] as const;
  const queue: number[] = [start[1] * cols + start[0]];
  reachable[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const c = idx % cols, r = (idx - c) / cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dx, nr = r + dy;
      const def = defAt(nc, nr);
      if (!def?.water) continue;
      const nidx = nr * cols + nc;
      if (reachable[nidx]) continue;
      reachable[nidx] = 1;
      queue.push(nidx);
    }
  }

  const nearLand = (c: number, r: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (defAt(c + dx, r + dy)?.land) return true;
      }
    }
    return false;
  };
  const distToRect = (x: number, y: number, rect: Rect): number => Math.hypot(
    Math.max(rect.x - x, 0, x - (rect.x + rect.w)),
    Math.max(rect.y - y, 0, y - (rect.y + rect.h)),
  );
  const nearHarbor = (x: number, y: number): boolean =>
    Math.hypot(x - WORLD.spawn.x, y - WORLD.spawn.y) < SCHOOL_MIN_GAP
    || WORLD.triggers.some(t => distToRect(x, y, t.rect) < SCHOOL_MIN_GAP)
    || WORLD.buildings.some(b => distToRect(x, y, b.rect) === 0);

  const out = new Map<ZoneId, number[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const def = map.palette[map.codes[idx]];
      if (!def?.water || !def.zone || !reachable[idx] || nearLand(c, r)) continue;
      const { x, y } = cellCenter(idx);
      if (nearHarbor(x, y)) continue;
      let list = out.get(def.zone);
      if (!list) out.set(def.zone, list = []);
      list.push(idx);
    }
  }
  candidateCache = out;
  return out;
}

/** 칸 중앙 좌표 — 세로는 11px라 반 칸을 내림해 정수 좌표를 유지한다 */
function cellCenter(idx: number): { x: number; y: number } {
  const { cols, cellW, cellH } = WORLD_MAP;
  const c = idx % cols, r = (idx - c) / cols;
  return { x: c * cellW + Math.floor(cellW / 2), y: r * cellH + Math.floor(cellH / 2) };
}

// ---------- 생성 ----------

/** 배치 순서 — 특수 해역(좁은 하위 존, 최소 1개 보장)을 먼저 놓고 일반 해역을 채운다.
 *  존 트리에서 파생하므로 스팟을 추가하면 자동으로 배치 대상이 된다. */
function placementOrder(): Array<{ spot: SpotId; min: number; max: number }> {
  const worldZones = ZONES.filter(z => zoneGroup(z.id) === 'world');
  const special = worldZones.filter(z => z.parent)
    .flatMap(z => z.spots.map(spot => ({ spot, ...SPECIAL_SCHOOLS })));
  const general = worldZones.filter(z => !z.parent)
    .flatMap(z => z.spots.map(spot => ({ spot, ...GENERAL_SCHOOLS })));
  return [...special, ...general];
}

/** 대양 어군 — 날짜 시드로 결정되는 순수 생성. 스팟마다 독립 난수 흐름을 쓰므로
 *  한 스팟의 후보가 바뀌어도 다른 스팟의 배치는 그대로다. 간격 조건을 끝내 못 채우면
 *  그 스팟은 놓은 만큼만 둔다(특수 해역은 첫 자리가 항상 성공해 1개가 보장된다). */
export function generateWorldSchools(day: string): School[] {
  const candidates = candidatesByZone();
  const placed: School[] = [];
  for (const { spot, min, max } of placementOrder()) {
    const zone = zoneOfSpot(spot);
    const pool = zone ? [...(candidates.get(zone) ?? [])] : [];
    const rng = mulberry32(hashSeed(`${day}/${spot}`));
    const count = min + Math.floor(rng() * (max - min + 1));
    // Fisher–Yates 셔플 뒤 앞에서부터 간격 조건을 만족하는 칸을 고른다
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let n = 0;
    for (const idx of pool) {
      if (n >= count) break;
      const { x, y } = cellCenter(idx);
      if (placed.some(s => Math.hypot(s.x - x, s.y - y) < SCHOOL_MIN_GAP)) continue;
      placed.push({ id: `${spot}-${++n}`, spot, x, y });
    }
  }
  return placed;
}

// 날짜별 결과 캐시(1칸) — 프레임 루프·미니맵·지역 탭이 같은 배열을 공유한다
let dayCache: { day: string; schools: School[] } | null = null;

function worldSchools(day: string): School[] {
  if (dayCache?.day !== day) dayCache = { day, schools: generateWorldSchools(day) };
  return dayCache.schools;
}
