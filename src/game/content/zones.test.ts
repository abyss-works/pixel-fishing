// 구역(zone) 데이터 무결성 — 오픈월드화 spec/zones.md의 계약을 강제한다.
// zone은 spot의 집합 메타(조회 뷰)다: spot 소속의 유일성·존재성·게이트 단조가 여기서 깨지면
// 구역 경계 게이트와 지역 탭이 조용히 틀린 값을 보여준다.
import { describe, it, expect } from 'vitest';
import { SPOTS } from './spots';
import { ZONES, ZONE_IDS, zoneById, zoneOfSpot, spotsOfRegion, defaultZoneOfRegion } from './zones';
import { FISH } from './fish';

describe('zones 데이터 계약', () => {
  it('모든 water spot은 정확히 1개 구역에 소속된다', () => {
    const spotIds = SPOTS.map(s => s.id);
    for (const id of spotIds) {
      const owners = ZONES.filter(z => z.spots.includes(id));
      expect(owners, `${id} 소속 구역 수`).toHaveLength(1);
    }
    // 역방향 — zones.spots의 모든 행은 실제 수역이어야 한다
    for (const z of ZONES) {
      for (const sid of z.spots) {
        expect(SPOTS.some(s => s.id === sid), `${z.id}의 알 수 없는 수역 ${sid}`).toBe(true);
      }
    }
  });

  it('zoneOfSpot은 전 수역을 빠짐없이 돌려준다', () => {
    for (const s of SPOTS) expect(zoneOfSpot(s.id), s.id).toBeDefined();
  });

  it('ZONE_IDS는 등록 순서(마을→태평양→동남아→인도양)의 단일 출처이다', () => {
    expect(ZONE_IDS).toEqual(['village', 'pacific', 'seasia', 'indian']);
    expect(ZONE_IDS.map(id => zoneById(id)!.id)).toEqual(ZONE_IDS);
  });

  it('진입 게이트는 바다 구역만 가지고 단조 증가한다 (진입 난이도 = 지리적 흐름)', () => {
    // 마을은 문/포구로만 드나든다 — 구역 게이트 대상이 아니다(Q7 거점=문 원칙).
    expect(zoneById('village')!.entryBoat).toBeUndefined();
    const sea = (['pacific', 'seasia', 'indian'] as const).map(id => zoneById(id)!.entryBoat ?? 0);
    expect(sea[0]).toBe(0);                    // 태평양 — 포구 게이트(requiredBoat 1)가 관문
    expect(sea[1]).toBeGreaterThanOrEqual(3);  // 동남아 — 구 O_EXIT(boat 3) 계승
    expect(sea[2]).toBeGreaterThanOrEqual(5);  // 인도양 — 구 말라카 게이트(boat 5) 계승
    expect(sea[2]).toBeGreaterThan(sea[1]);
    for (const id of ['seasia', 'indian'] as const) {
      const z = zoneById(id)!;
      expect(z.gateMsg, `${id} 게이트 안내문`).toBeTruthy();
      // 막힌 경계가 보이지 않는 선이라 안내문에 구역 이름이 있어야 어디가 막혔는지 안다 (고도화 A-1)
      expect(z.gateMsg).toContain(z.name);
    }
  });

  it('모든 어종은 소속 수역의 구역에도 속한다 (fish → spot → zone 경로 완결)', () => {
    for (const f of FISH) expect(zoneOfSpot(f.spot), `${f.id}(${f.spot})`).toBeDefined();
  });

  it('씬 지역 소속 수역 집합 — 마을 2개, 병합 바다 7개', () => {
    expect(spotsOfRegion('village').map(s => s.id)).toEqual(['pond', 'river']);
    expect(spotsOfRegion('world')).toHaveLength(7);
  });

  it('기본 구역 — 마을 씬은 마을, 병합 바다는 태평양(고향 항구 소재)', () => {
    expect(defaultZoneOfRegion('village')).toBe('village');
    expect(defaultZoneOfRegion('world')).toBe('pacific');
  });
});
