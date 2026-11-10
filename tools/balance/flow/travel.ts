// 이동 시간 측정 — 가방이 차면 판매하러 돌아갔다가 어군으로 다시 가는 왕복이 낚시 시간에서 차지하는 비중을 해역마다 잰다.
// 왕복의 정의(규칙에서 읽은 값): 가방 용량은 배 단계로 정해지고(넘치면 놓아준다), 판매 창구는 마을은 집 안 상자, 대양은 그 구역 항구 안이다.
//   그래서 가방이 찰 때까지 낚고 → 거점으로 이동 → 판매 → 어군으로 돌아오는 것을 한 번의 왕복으로 본다. 왕복은 가방이 찰 때마다 한 번이다.
// 거리는 거점의 출입 자리(마을 집 문, 항구 출항 자리)에서 그 해역 어군까지의 직선거리이고, 어군 위치는 날짜 시드로 배치된 날들의 평균이다.
// 가정(규칙에서 읽을 수 없는 값): 육지를 도는 우회, 접안과 거점 안 이동, 판매 창 조작 시간은 넣지 않는다. 가방 채움은 해역 진입 레벨의 방치 속도로 본다.
//   직선거리는 하한이므로 비중도 하한이다. headroomSec은 이런 미반영 시간이 왕복당 이만큼 더해져도 비중이 TRAVEL_MATERIAL을 넘지 않는 한도다.
import { SPOTS } from '../../../src/game/content/spots';
import type { SpotId } from '../../../src/game/content/spots';
import { BOATS } from '../../../src/game/content/boats';
import { portOfZone } from '../../../src/game/content/bounties';
import { topZoneOfSpot } from '../../../src/game/content/zones';
import { WALK_SPEED } from '../../../src/game/rules/balance';
import { capOfBoat } from '../../../src/game/rules/logic';
import { BASE_PACKS, HARBORS, V_DOOR, generateWorldSchools, schoolsOf } from '../../../src/game/world';
import type { Point } from '../../../src/game/world';
import { entryLevel, rates } from '../model';

/** 이동 시간이 낚시 시간의 이 비중 이상이면 보정 방식을 해역별 계산으로 바꿀 만큼 크다고 본다 */
export const TRAVEL_MATERIAL = 0.05;

/** 어군 배치를 재는 날 수의 기본값 — 2026-01-01부터 이 일수만큼 */
export const TRAVEL_SAMPLE_DAYS = 120;

export interface TravelRow {
  spot: SpotId;
  /** 판매하러 가는 거점의 이름 */
  base: string;
  /** 거점 출입 자리에서 어군까지의 평균 거리와 관측한 가장 먼 거리(px) */
  distance: number; distanceMax: number;
  /** 이동 속도(px/s) — 마을은 도보, 대양은 그 해역을 여는 배 */
  speed: number;
  bagCap: number;
  /** 가방이 차는 시간(초)과 왕복 시간(초) */
  fillSec: number; tripSec: number;
  /** 낚시 시간 중 왕복의 비중 = 왕복 ÷ (가방 채움 + 왕복) */
  share: number;
  /** 왕복마다 더해도 비중이 TRAVEL_MATERIAL 이하로 남는 여유 시간(초) */
  headroomSec: number;
}

const dayStrings = (days: number): string[] =>
  Array.from({ length: days }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

const center = (r: { x: number; y: number; w: number; h: number }): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function travelRows(days: number = TRAVEL_SAMPLE_DAYS): TravelRow[] {
  if (!Number.isInteger(days) || days < 1) throw new Error('어군을 재는 날 수는 1 이상의 정수여야 합니다');
  const world = dayStrings(days).map(generateWorldSchools);
  return SPOTS.map(spot => {
    const sea = spot.boatTier > 0;
    const port = sea ? portOfZone(topZoneOfSpot(spot.id) as never) as keyof typeof HARBORS : null;
    const origin = port ? HARBORS[port].departure : center(V_DOOR);
    const base = BASE_PACKS[port ?? 'home'].name;
    const schools = sea ? world.flat() : schoolsOf('village', '');
    const d = schools.filter(s => s.spot === spot.id).map(s => Math.hypot(s.x - origin.x, s.y - origin.y));
    const distance = d.reduce((a, b) => a + b, 0) / d.length;
    const speed = sea ? BOATS.find(b => b.tier === spot.boatTier)!.speed : WALK_SPEED;
    const bagCap = capOfBoat(spot.boatTier);
    const fillSec = bagCap / rates(spot.id, entryLevel(spot.id), 'idle').catchesPerHour * 3600;
    const tripSec = 2 * distance / speed;
    const m = TRAVEL_MATERIAL;
    return {
      spot: spot.id, base, distance, distanceMax: Math.max(...d), speed, bagCap, fillSec, tripSec,
      share: tripSec / (fillSec + tripSec),
      headroomSec: (m * fillSec - (1 - m) * tripSec) / (1 - m),
    };
  });
}

/** 일괄 보정에 쓰는 기본 비중 — 해역별 비중의 최댓값(가장 큰 해역 기준으로 잡아 어느 해역에서도 이동을 과소평가하지 않는다) */
export const travelShareDefault = (rows: readonly TravelRow[]): number => Math.max(0, ...rows.map(r => r.share));
