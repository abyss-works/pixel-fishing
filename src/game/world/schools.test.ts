// 대양 어군 절차 배치 — 날짜 시드 하나로 결정되는 순수 생성의 규칙을 검증한다.
import { describe, it, expect } from 'vitest';
import { ZONES, zoneGroup, zoneOfSpot } from '../content/zones';
import type { SpotId } from '../content/spots';
import { cellDefAt } from './mask';
import { canMove, zoneOf } from './engine';
import { WORLD, WORLD_MAP } from './regions/world';
import { V_SCHOOLS } from './regions/village';
import { CAST_RANGE } from '../rules/balance';
import {
  GENERAL_SCHOOLS, SCHOOL_MIN_GAP, SPECIAL_SCHOOLS, generateWorldSchools, schoolsOf,
} from './schools';
import type { School } from './types';

const DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2027-01-01', '2026-02-28'];

/** 대양 존 트리에서 파생한 스팟 구분 — 최상위 존의 스팟은 일반, 하위 존의 스팟은 특수 */
const worldZones = ZONES.filter(z => zoneGroup(z.id) === 'world');
const GENERAL: SpotId[] = worldZones.filter(z => !z.parent).flatMap(z => z.spots);
const SPECIAL: SpotId[] = worldZones.filter(z => z.parent).flatMap(z => z.spots);

const bySpot = (schools: School[]): Map<SpotId, School[]> => {
  const out = new Map<SpotId, School[]>();
  for (const s of schools) out.set(s.spot, [...(out.get(s.spot) ?? []), s]);
  return out;
};

describe('generateWorldSchools — 결정성', () => {
  it('같은 날짜는 같은 배치, 다른 날짜는 다른 배치', () => {
    const a1 = JSON.stringify(generateWorldSchools('2026-10-18'));
    const b = JSON.stringify(generateWorldSchools('2026-10-19'));
    const a2 = JSON.stringify(generateWorldSchools('2026-10-18')); // 캐시가 아니라 재계산 결과
    expect(a2).toBe(a1);
    expect(b).not.toBe(a1);
  });

  it('어군 id는 스팟과 1부터 시작하는 순번이다', () => {
    for (const [spot, list] of bySpot(generateWorldSchools('2026-10-18'))) {
      expect(list.map(s => s.id)).toEqual(list.map((_, i) => `${spot}-${i + 1}`));
    }
  });
});

describe('generateWorldSchools — 개수', () => {
  it('일반 해역은 7~8개, 특수 해역은 1~2개이고 동남아 열린 바다에는 어군이 없다', () => {
    expect(GENERAL).toEqual(['sea', 'indian', 'mozstrait']);
    expect(SPECIAL).toEqual(['deep', 'dragonhole', 'coron', 'barrierreef', 'southindian', 'comorodeep']);
    for (const day of DAYS) {
      const groups = bySpot(generateWorldSchools(day));
      for (const spot of GENERAL) {
        const n = groups.get(spot)?.length ?? 0;
        expect(n, `${day} ${spot}`).toBeGreaterThanOrEqual(GENERAL_SCHOOLS.min);
        expect(n, `${day} ${spot}`).toBeLessThanOrEqual(GENERAL_SCHOOLS.max);
      }
      for (const spot of SPECIAL) {
        const n = groups.get(spot)?.length ?? 0;
        expect(n, `${day} ${spot}`).toBeGreaterThanOrEqual(SPECIAL_SCHOOLS.min);
        expect(n, `${day} ${spot}`).toBeLessThanOrEqual(SPECIAL_SCHOOLS.max);
      }
      expect([...groups.keys()].every(spot => GENERAL.includes(spot) || SPECIAL.includes(spot))).toBe(true);
    }
    expect(GENERAL_SCHOOLS).toEqual({ min: 7, max: 8 });
    expect(SPECIAL_SCHOOLS).toEqual({ min: 1, max: 2 });
  });

  it('개수도 날짜에 따라 달라진다 (여러 날 가운데 7개인 날과 8개인 날이 모두 나온다)', () => {
    const counts = new Set<number>();
    for (let d = 1; d <= 20; d++) {
      const day = `2026-11-${String(d).padStart(2, '0')}`;
      counts.add(bySpot(generateWorldSchools(day)).get('sea')!.length);
    }
    expect(counts).toEqual(new Set([7, 8]));
  });
});

describe('generateWorldSchools — 자리 규칙', () => {
  it('모든 어군은 자기 스팟이 속한 존의 물 칸 위에 있다', () => {
    for (const day of DAYS) {
      for (const s of generateWorldSchools(day)) {
        expect(zoneOf(WORLD, s.x, s.y), `${day} ${s.id}`).toBe(zoneOfSpot(s.spot));
        expect(canMove(WORLD, s.x, s.y), `${day} ${s.id}`).toBe(true);
      }
    }
  });

  it('육지에 바로 붙은 칸(8방향 이웃)에는 두지 않는다', () => {
    const { cellW, cellH } = WORLD_MAP;
    for (const day of DAYS) {
      for (const s of generateWorldSchools(day)) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const def = cellDefAt(WORLD_MAP, s.x + dx * cellW, s.y + dy * cellH);
            expect(def?.land ?? false, `${day} ${s.id} 이웃(${dx},${dy})`).toBe(false);
          }
        }
      }
    }
  });

  it('어군끼리는 최소 간격을 지킨다 — 한 캐스팅 반경에 두 어군이 들어오지 않는다', () => {
    expect(SCHOOL_MIN_GAP).toBeGreaterThanOrEqual(2.5 * CAST_RANGE);
    for (const day of DAYS) {
      const list = generateWorldSchools(day);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
          expect(d, `${day} ${list[i].id}·${list[j].id}`).toBeGreaterThanOrEqual(SCHOOL_MIN_GAP);
        }
      }
    }
  });

  it('항구 앞(스폰·접안 트리거)에는 어군이 없다 — 접안 직후 바로 캐스팅되지 않는다', () => {
    for (const day of DAYS) {
      for (const s of generateWorldSchools(day)) {
        expect(Math.hypot(s.x - WORLD.spawn.x, s.y - WORLD.spawn.y), `${day} ${s.id} 스폰`)
          .toBeGreaterThan(CAST_RANGE);
        for (const trig of WORLD.triggers) {
          const dx = Math.max(trig.rect.x - s.x, 0, s.x - (trig.rect.x + trig.rect.w));
          const dy = Math.max(trig.rect.y - s.y, 0, s.y - (trig.rect.y + trig.rect.h));
          expect(Math.hypot(dx, dy), `${day} ${s.id} ${trig.action}`).toBeGreaterThan(CAST_RANGE);
        }
      }
    }
  });
});

describe('schoolsOf — 지역별 현재 어군', () => {
  it('마을은 고정 어군, 대양은 날짜 배치', () => {
    expect(schoolsOf('village', '2026-10-18')).toBe(V_SCHOOLS);
    expect(schoolsOf('village', '2026-10-19')).toBe(V_SCHOOLS);
    expect(schoolsOf('world', '2026-10-18')).toEqual(generateWorldSchools('2026-10-18'));
  });

  it('같은 날짜의 대양 어군은 같은 배열을 돌려준다 (프레임마다 재생성하지 않는다)', () => {
    expect(schoolsOf('world', '2026-10-18')).toBe(schoolsOf('world', '2026-10-18'));
  });
});
