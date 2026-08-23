// 레벨 데이터 스키마 (리팩토링 축 2)
// 지역/거점은 전부 이 타입의 "데이터"다 — 새 지역 = regions/<id>.ts 파일 1개(+신규 스프라이트).
// 충돌·수역 판정은 engine.ts가 데이터에서 파생하고, 그리기는 pixel/region.ts 인터프리터가 맡는다.
import type { SpotId, SpotRegionId } from '../data/spots';
import type { BaseId, LocationRef } from '../data/places';

// 지역 id의 단일 근원 = data/spots의 region 열 — 수역·지역 소개·팩이 전부 같은 타입을 쓴다
// (구: world가 리터럴 유니온을 별도 정의해 3중 정의 + 캐스트가 필요했다)
export type RegionId = SpotRegionId;
export type { BaseId } from '../data/places';
export type FurnitureId = 'sell' | 'rod' | 'boat' | 'dex' | 'exit' | 'travel';

/** 씬 참조 — 앱 셸의 장면 전환이 이 값으로 흐른다 (씬 그래프 = 팩 데이터에서 파생).
 *  정의는 `data/places.ts`에 있다: 세이브(`game/`)도 같은 타입을 써야 하는데 의존 방향이
 *  world → game 단방향이라 game이 여기를 볼 수 없다. 여기서는 재수출만 한다. */
export type SceneRef = LocationRef;

export const VIEW_W = 320, VIEW_H = 180;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export interface School { id: string; spot: SpotId; x: number; y: number }

/** 물 스타일 — 채움/가장자리/모래테는 pixel/region.ts의 WATER_STYLE 레지스트리가 정의 */
export type WaterStyleId = 'pond' | 'river' | 'sea' | 'deep';
export type DeckStyleId = 'bridge' | 'pier';

// 지형 조각 — 배열 순서 = 그리기 순서. 충돌 규칙(engine.canMove):
//   walk: 건물 불가 · deck 통행 · water 불가 · 그 외(지반) 통행
//   sail: 건물/land 불가 · 그 외(물) 통행
export type TerrainPiece =
  | { kind: 'water'; rect: Rect; style: WaterStyleId; spot?: SpotId } // spot 없으면 낚시 불가 수역(장식/경계)
  | { kind: 'land'; rect: Rect; name?: string }                       // sail 지역의 장애물 대륙
  | { kind: 'deck'; rect: Rect; style: DeckStyleId };                 // 물 위 통행로(다리/부두)

export type BuildingSpriteId = 'house' | 'boatshop' | 'harbor';
export interface Building { rect: Rect; sprite: BuildingSpriteId }

// 트리거 — 전환 목적지·안내문·게이트까지 데이터. 새 지역/항로 = 행 추가 (App/Field 무수정)
export type TriggerDef =
  | { rect: Rect; action: 'base'; msg: string }                      // pack.base 거점 진입
  | { rect: Rect; action: 'travel'; to: RegionId; msg: string;       // 다른 지역으로
      requiredBoat: number; blockedMsg: string }                     // 게이트 미달 시 되밀기+안내
  | { rect: Rect; action: 'shop' };                                  // 필드 시설 패널

export interface MapLabel {
  text: string; x: number; y: number;
  color?: 'gold' | 'text' | 'faint'; // faint = 지명 워터마크 톤 (필드/지도에서 알파가 다름)
  size?: number;
}

export type Decoration = { kind: 'tree'; x: number; y: number };

/** 지역 소개 — 사이드바 지역 탭·도감 서브탭용 로어/팁 (구 data/regions.ts REGION_INFO 흡수) */
export interface RegionLore {
  shortName: string;  // 도감 서브탭 등 좁은 UI용
  tagline: string;    // 한 줄 분위기
  lore: string;       // 2~3문장 소개
  tips: string[];     // 지역 한정 도움말
  controls: string[]; // 조작 안내 (지역 탭 맨 아래)
}

export interface RegionPack {
  id: RegionId;
  name: string;
  /** 이 지역의 거점 (base 트리거가 진입시키는 곳) */
  base: BaseId;
  info: RegionLore;
  w: number;
  h: number;
  movement: 'walk' | 'sail';
  /** 바탕 — walk 지역은 지반색, sail 지역은 전역이 물(스타일 참조). mapColor는 월드맵 축소판용 */
  ground:
    | { kind: 'grass'; color: string; dot: string; mapColor: string }
    | { kind: 'water'; style: WaterStyleId };
  /** sail 지역: 명시된 수역 조각 밖의 기본 해역 (예: 대양 전체 = sea) */
  defaultSpot?: SpotId;
  /** 물결 파티클 수 — grass 지역은 수역 조각 위를 순환, water 지역은 지도 전체 */
  waveCount: number;
  terrain: TerrainPiece[];
  buildings: Building[];
  decorations: Decoration[];
  schools: School[];
  spawn: Point;
  triggers: TriggerDef[]; // 배열 순서 = 검사 순서
  labels: MapLabel[];     // 필드 라벨
  mapLabels: MapLabel[];  // 월드맵 전용 라벨 (필드와 크기·문구가 다르다)
  /** 지역 고유 연출 훅 (지역당 1개, 장식 전용 — 지형/건물을 여기서 그리지 말 것) */
  flavor?: (ctx: CanvasRenderingContext2D, t: number) => void;
}

// ---------- 거점 (집/항구) ----------

export type FurnitureSpriteId =
  | 'bookshelf' | 'workbench' | 'chest' | 'door'            // 집
  | 'office' | 'rodshop' | 'market' | 'shipyard' | 'boarding' | 'ferry'; // 항구

/** 라벨의 동적 데이터(도감 수·낚싯대 Lv·배 이름) 주입 */
export interface BaseInfo { rod: number; boatName: string; dexCount: number; dexTotal: number }

// Rect 평면 필드 유지 — 히트테스트/테스트가 f.x + f.w/2 형태로 읽는 기존 계약 보존
export interface Furniture extends Rect {
  id: FurnitureId;
  sprite: FurnitureSpriteId;
  label: (info: BaseInfo) => string;
  labelDy: number; // 라벨 y 오프셋 (rect.y 기준)
}

export interface BasePack {
  id: BaseId;
  /** 소속 지역 — exit 시설이 내보내는 곳이자 사이드바 지역 탭의 문맥 */
  region: RegionId;
  headline: string;  // 상단 안내 문구
  exitMsg: string;   // exit 시설로 필드에 나갈 때 안내
  /** 여객선 등 지역 간 이동 시설 (travel 가구가 있을 때만) */
  travel?: { to: RegionId; msg: string };
  furniture: Furniture[];
}
