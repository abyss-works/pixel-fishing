// 월드 모듈 진입점 — 데이터(regions/bases) + 엔진 조립, 기존 './world' import 경로 호환.
// 새 지역 추가 절차: ① regions/<id>.ts 데이터 작성 ② REGION_PACKS에 등록
// ③ (신규 건물이 있으면) pixel/buildings.ts에 스프라이트 추가 — 끝. 테스트(world.test)는
// REGION_PACKS를 순회하므로 자동으로 새 지역을 검증한다.
import type { BaseId, BasePack, Furniture, RegionId, RegionPack } from './types';
import { inRect } from './engine';
import { VILLAGE } from './regions/village';
import { OCEAN } from './regions/ocean';
import { HOME } from './bases/home';
import { HARBOR_BASE } from './bases/harbor';

export * from './types';
export {
  CAST_RANGE, canMove, zoneAt, movePlayer, inTrigger, nearestSchoolInRange, inRect,
} from './engine';
export { VILLAGE, V_SPAWN, V_POND, V_HOUSE, V_DOOR, V_BRIDGE, V_PIER, V_PORT, V_PORT_FRONT,
  V_BOATSHOP, V_BOATSHOP_TRIGGER, V_SCHOOLS, VILLAGE_W, VILLAGE_H } from './regions/village';
export { OCEAN, LANDS, TRENCH, HARBOR, O_DOCK, O_SPAWN, O_SCHOOLS, OCEAN_W, OCEAN_H } from './regions/ocean';

export const REGION_PACKS: Record<RegionId, RegionPack> = {
  village: VILLAGE,
  ocean: OCEAN,
};

export const BASE_PACKS: Record<BaseId, BasePack> = {
  home: HOME,
  harbor: HARBOR_BASE,
};

// 기존 경로 호환 (app.test 등)
export const HOME_FURNITURE = HOME.furniture;
export const HARBOR_FURNITURE = HARBOR_BASE.furniture;

export function furnitureAt(base: BaseId, x: number, y: number): Furniture | null {
  for (const f of BASE_PACKS[base].furniture) if (inRect(x, y, f)) return f;
  return null;
}
