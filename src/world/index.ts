// 월드 모듈 진입점 — 데이터(regions/bases) + 엔진 조립, 기존 './world' import 경로 호환.
// 새 지역 추가 절차: ① regions/<id>.ts 데이터 작성 ② REGION_PACKS에 등록
// ③ (신규 건물이 있으면) pixel/buildings.ts에 스프라이트 추가 — 끝. 테스트(world.test)는
// REGION_PACKS를 순회하므로 자동으로 새 지역을 검증한다.
//
// 오픈월드화(spec/zone-tree.md): 씬 지역은 village(도보)와 world(병합 바다)뿐이다.
// 구 3지역 팩(ocean/seasia/indian)은 삭제됐다 — 원본은 git 히스토리(a40bd0a)에 있다.
// 구세이브 location의 구 지역 id(ocean 등)는 런타임 문자열로만 남는다 —
// App.sceneOf가 고향 항구로 접는다.
import type { BaseId, BasePack, Furniture, RegionId, RegionPack } from './types';
import { inRect } from './engine';
import { VILLAGE } from './regions/village';
import { WORLD } from './regions/world';
import { HOME } from './bases/home';
import { HARBOR_BASE } from './bases/harbor';
import { MANILA_BASE } from './bases/manila';
import { COLOMBO_BASE } from './bases/colombo';

export * from './types';
export {
  CAST_RANGE, ZoneTracker, canMove, zoneOf, movePlayer, inTrigger, nearestSchoolInRange, inRect, entryPoint,
} from './engine';
export { VILLAGE, V_SPAWN, V_POND, V_HOUSE, V_DOOR, V_BRIDGE, V_PIER, V_PORT, V_PORT_FRONT,
  V_BOATSHOP, V_BOATSHOP_TRIGGER, V_SCHOOLS, VILLAGE_W, VILLAGE_H } from './regions/village';
export { WORLD, WORLD_MAP, WORLD_SPAWN, WORLD_SCHOOLS, WORLD_W, WORLD_H,
  HARBOR_DOCK, MANILA_DOCK, COLOMBO_DOCK, MANILA_SPAWN, COLOMBO_SPAWN } from './regions/world';

export const REGION_PACKS: Record<RegionId, RegionPack> = {
  village: VILLAGE,
  world: WORLD,
};

/** 씬 지역 id 순서의 단일 출처(등록 순서). UI 순환은 ZONE_IDS(data/zones)를 쓴다. */
export const REGION_IDS: RegionId[] = Object.keys(REGION_PACKS) as RegionId[];

/** 라이브 씬 그래프에서 도달하는 지역 — 세이브 location 복원이 이 목록으로 검증한다.
 *  밖의 값(구세이브의 ocean/seasia/indian 등 런타임 문자열)은 고향 항구로 떨어진다. */
export const LIVE_REGIONS: RegionId[] = ['village', 'world'];

export const BASE_PACKS: Record<BaseId, BasePack> = {
  home: HOME,
  harbor: HARBOR_BASE,
  manila: MANILA_BASE,
  colombo: COLOMBO_BASE,
};

// 기존 경로 호환 (app.test 등)
export const HOME_FURNITURE = HOME.furniture;
export const HARBOR_FURNITURE = HARBOR_BASE.furniture;
export const MANILA_FURNITURE = MANILA_BASE.furniture;
export const COLOMBO_FURNITURE = COLOMBO_BASE.furniture;

export function furnitureAt(base: BaseId, x: number, y: number): Furniture | null {
  for (const f of BASE_PACKS[base].furniture) if (inRect(x, y, f)) return f;
  return null;
}
