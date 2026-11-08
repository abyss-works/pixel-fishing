// 월드 모듈 진입점 — 지역·거점 데이터를 엔진과 조립한다. 기존 import API와 호환한다.
// 새 지역 추가 절차: ① 지역 데이터를 작성하고 ② REGION_PACKS에 등록한다.
// ③ (신규 건물이 있으면) 픽셀 렌더링에 스프라이트를 추가한다. 통합 테스트는
// REGION_PACKS를 순회하므로 자동으로 새 지역을 검증한다.
//
// 오픈월드 씬 지역은 village(도보)와 world(병합 바다)뿐이다.
// 구 3지역 팩(ocean/seasia/indian)은 삭제됐다 — 원본은 git 히스토리(a40bd0a)에 있다.
// 구세이브 location의 구 지역 id(ocean 등)는 런타임 문자열로만 남는다 —
// App.sceneOf가 고향 항구로 접는다.
import type { BaseId, BasePack, Furniture, Point, RegionId, RegionPack } from './types';
import { canMove, inRect } from './engine';
import { VILLAGE } from './regions/village';
import { WORLD } from './regions/world';
import { HOME } from './bases/home';
import { HARBOR_BASE } from './bases/harbor';
import { MANILA_BASE } from './bases/manila';
import { COLOMBO_BASE } from './bases/colombo';
import { TOAMASINA_BASE } from './bases/toamasina';
import { WALVISBAY_BASE } from './bases/walvisbay';

export * from './types';
export {
  ZoneTracker, canMove, zoneOf, inClosedSea, closedSeaBlock, movePlayer, inTrigger, nearestSchoolInRange, inRect, entryPoint,
} from './engine';
export { VILLAGE, V_SPAWN, V_POND, V_HOUSE, V_DOOR, V_BRIDGE, V_PIER, V_PORT, V_PORT_FRONT,
  V_SCHOOLS, VILLAGE_W, VILLAGE_H } from './regions/village';
export { WORLD, WORLD_MAP, WORLD_SPAWN, WORLD_BOUNDS,
  HARBOR_DOCK, MANILA_DOCK, COLOMBO_DOCK, TOAMASINA_DOCK, WALVISBAY_DOCK,
  MANILA_SPAWN, COLOMBO_SPAWN, TOAMASINA_SPAWN, WALVISBAY_SPAWN } from './regions/world';
export { schoolsOf, generateWorldSchools, SCHOOL_MIN_GAP } from './schools';

export const REGION_PACKS: Record<RegionId, RegionPack> = {
  village: VILLAGE,
  world: WORLD,
};

/** 씬 지역 id 순서의 단일 출처(등록 순서). UI 순환은 ZONE_IDS(구역 데이터)를 쓴다. */
export const REGION_IDS: RegionId[] = Object.keys(REGION_PACKS) as RegionId[];

/** 라이브 씬 그래프에서 도달하는 지역 — 세이브 location 복원이 이 목록으로 검증한다.
 *  밖의 값(구세이브의 ocean/seasia/indian 등 런타임 문자열)은 고향 항구로 떨어진다. */
export const LIVE_REGIONS: RegionId[] = ['village', 'world'];

export const BASE_PACKS: Record<BaseId, BasePack> = {
  home: HOME,
  harbor: HARBOR_BASE,
  manila: MANILA_BASE,
  colombo: COLOMBO_BASE,
  toamasina: TOAMASINA_BASE,
  walvisbay: WALVISBAY_BASE,
};

// 기존 경로 호환 (app.test 등)
export const HOME_FURNITURE = HOME.furniture;
export const HARBOR_FURNITURE = HARBOR_BASE.furniture;
export const MANILA_FURNITURE = MANILA_BASE.furniture;
export const COLOMBO_FURNITURE = COLOMBO_BASE.furniture;
export const TOAMASINA_FURNITURE = TOAMASINA_BASE.furniture;
export const WALVISBAY_FURNITURE = WALVISBAY_BASE.furniture;

/** 승선 — 거점에서 필드로 나갈 때 나타나는 지역·자리·안내. 승선 시설과 여객선 빠른 이동이 같은 자리를 쓴다 */
export function boardingOf(base: BaseId): { region: RegionId; at: Point | undefined; msg: string } {
  const pack = BASE_PACKS[base];
  return { region: pack.region, at: pack.exitAt, msg: pack.exitMsg };
}

export function furnitureAt(base: BaseId, x: number, y: number): Furniture | null {
  for (const f of BASE_PACKS[base].furniture) if (inRect(x, y, f)) return f;
  return null;
}

/**
 * 다시 접속했을 때의 시작점. 마지막 위치가 같은 지역의 갈 수 있는 자리이고 이동 트리거 위가 아니면 그 좌표다.
 * 그 밖에는 null이고, 호출자는 지역 출발점에서 시작한다.
 */
export function resumePoint(region: RegionId, saved: { region: string; x: number; y: number } | null): Point | null {
  if (!saved || saved.region !== region) return null;
  const { x, y } = saved;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const pack = REGION_PACKS[region];
  if (!canMove(pack, x, y)) return null;
  if (pack.triggers.some(t => inRect(x, y, t.rect))) return null;
  return { x, y };
}
