// 레벨 데이터 스키마 (리팩토링 축 2)
// 지역/거점은 전부 이 타입의 "데이터"다 — 새 지역 = regions/<id>.ts 파일 1개(+신규 스프라이트).
// 충돌·수역 판정은 engine.ts가 데이터에서 파생하고, 그리기는 pixel/region.ts 인터프리터가 맡는다.
import type { SpotId } from '../data/spots';

export type RegionId = 'village' | 'ocean';
export type BaseId = 'home' | 'harbor';
export type FurnitureId = 'sell' | 'rod' | 'boat' | 'dex' | 'exit' | 'travel';

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

export type TriggerAction = 'base' | 'travel' | 'shop';
export interface TriggerDef { rect: Rect; action: TriggerAction }

export interface MapLabel {
  text: string; x: number; y: number;
  color?: 'gold' | 'text' | 'faint'; // faint = 지명 워터마크 톤 (필드/지도에서 알파가 다름)
  size?: number;
}

export type Decoration = { kind: 'tree'; x: number; y: number };

export interface RegionPack {
  id: RegionId;
  name: string;
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
  headline: string; // 상단 안내 문구
  furniture: Furniture[];
}
