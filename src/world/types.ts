// 레벨 데이터 스키마 (리팩토링 축 2)
// 지역/거점은 전부 이 타입의 "데이터"다 — 새 지역 = regions/<id>.ts 파일 1개(+신규 스프라이트).
// 충돌·수역 판정은 engine.ts가 데이터에서 파생하고, 그리기는 pixel/region.ts 인터프리터가 맡는다.
import type { SpotId } from '../data/spots';
import type { BaseId, LocationRef, RegionId } from '../data/places';
import type { ZoneId } from '../data/zones';

// 지역 id의 단일 근원 = data/places(수역 region 열 + 병합 바다 'world') — 수역·지역 소개·팩이
// 전부 같은 타입을 쓴다 (구: world가 리터럴 유니온을 별도 정의해 3중 정의 + 캐스트가 필요했다)
export type { RegionId };
export type { BaseId } from '../data/places';
export type FurnitureId = 'sell' | 'rod' | 'boat' | 'shop' | 'dex' | 'exit' | 'travel' | 'bounty';

/** 씬 참조 — 앱 셸의 장면 전환이 이 값으로 흐른다 (씬 그래프 = 팩 데이터에서 파생).
 *  정의는 `data/places.ts`에 있다: 세이브(`game/`)도 같은 타입을 써야 하는데 의존 방향이
 *  world → game 단방향이라 game이 여기를 볼 수 없다. 여기서는 재수출만 한다. */
export type SceneRef = LocationRef;

/** 거점(집·항구 내부) 설계 좌표 — 배경·가구가 이 공간에 깔린다. 필드와 **별개 축**이다:
 *  거점은 1인칭 정지 화면이라 시야 확대의 대상이 아니다(확대 시 가구 재배치 필요). */
export const VIEW_W = 320, VIEW_H = 180;
/** 필드 카메라 시야 — 2026-08-28 사용자 지시로 1.4× 확대(320×180 → 448×252, 16:9 유지).
 *  병합 바다 2배 확대와 짝을 이루는 체감 조정: 같은 화면에 더 넓은 세계가 들어온다.
 *  카메라 클램프·마스크 컬링·미니맵 crop이 이 값을 따른다. */
export const FIELD_VIEW_W = 448, FIELD_VIEW_H = 252;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }
export interface School { id: string; spot: SpotId; x: number; y: number }

/** 물 스타일 — 채움/가장자리/모래테는 pixel/region.ts의 WATER_STYLE 레지스트리가 정의 */
export type WaterStyleId = 'pond' | 'river' | 'sea' | 'deep' | 'coral' | 'wreck';
export type DeckStyleId = 'bridge' | 'pier';

// 지형 조각 — 배열 순서 = 그리기 순서. 충돌 규칙(engine.canMove):
//   walk: 건물 불가 · deck 통행 · water 불가 · 그 외(지반) 통행
//   sail: 건물/land 불가 · 그 외(물) 통행
export type TerrainPiece =
  | { kind: 'water'; rect: Rect; style: WaterStyleId }  // 낚시 대상은 어군(학교) — 물은 지형일 뿐
  | { kind: 'land'; rect: Rect; name?: string }         // sail 지역의 장애물 대륙
  | { kind: 'deck'; rect: Rect; style: DeckStyleId };   // 물 위 통행로(다리/부두)

export type BuildingSpriteId = 'house' | 'boatshop' | 'harbor';
export interface Building { rect: Rect; sprite: BuildingSpriteId }

// 트리거 — 전환 목적지·안내문·게이트까지 데이터. 새 지역/항로 = 행 추가 (App/Field 무수정)
export type Edge = 'top' | 'bottom' | 'left' | 'right';
export type TriggerDef =
  | { rect: Rect; action: 'base'; msg: string;                    // 거점 진입
      /** 진입할 거점 — 병합 바다처럼 팩에 거점이 여러 개일 때 필수. 미지정 = pack.base */
      base?: BaseId }
  | { rect: Rect; action: 'travel'; to: RegionId; msg: string;       // 다른 지역으로
      requiredBoat: number; blockedMsg: string;                      // 게이트 미달 시 되밀기+안내
      /** 경계 봉합(오픈월드) — 지정하면 스폰 텔레포트 대신 상대 지역의 마주 보는 가장자리에서
       *  벗어난 자리 좌표를 보존해 입장한다(edge=top/bottom이면 x, left/right면 y 보존).
       *  미지정이면 목적지 pack.spawn에서 시작(거점 항로 — 포구→항구 앞). */
      entry?: { edge: Edge } }
  | { rect: Rect; action: 'shop' };                                  // 필드 시설 패널

export interface MapLabel {
  text: string; x: number; y: number;
  color?: 'gold' | 'text' | 'faint'; // faint = 지명 워터마크 톤 (필드/지도에서 알파가 다름)
  size?: number;
}

export type Decoration = { kind: 'tree'; x: number; y: number };

/** 지형 마스크 셀 정의 — legend 문자 하나가 한 칸(cellW×cellH)의 성질 */
export interface MapCellDef {
  /** 육지 — sail 지역에서 통행 불가. 렌더러는 풀+모래테로 찍는다 */
  land?: boolean;
  /** 물 — walk 지역에서 통행 불가 */
  water?: boolean;
  style?: WaterStyleId;   // 물 색 토큰 (styles.ts WATER_STYLE)
  /** 소속 구역 — 존 계층의 셀 단위 근원(spec/zone-tree.md: 셀은 zone만 안다 — 스팟은
   *  존 안에 배치되는 어군 오브젝트라 셀에 새기지 않는다). 미지정 = 구역 밖 물(통행만) */
  zone?: ZoneId;
  /** 수역 표기명 — 같은 def 셀 군집의 상단 중앙에 자동 라벨로 뜬다 (하드코딩 금지) */
  label?: string;
}

/** 컴파일된 마스크 — codes[r*cols+c] = palette 인덱스(1부터, 0=미정의 기반).
 *  셀은 비등방(cellW≠cellH) — 세로 스케일링으로 지형 비율을 조정한다. */
export interface CompiledMap {
  cellW: number; cellH: number;
  cols: number; rows: number;
  codes: Uint8Array;
  palette: (MapCellDef | undefined)[];
}

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
  /** 지리 창(경위도) — 실지형 파이프라인(config → generated 마스크)이 심는다.
   *  이 값으로 px↔m 스케일을 파생한다(1° 위도 ≈ 111,320m). walk 지역(마을)은 없음. */
  geoWindow?: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  movement: 'walk' | 'sail';
  /** 바탕 (walk 지역/village) — 지반색. mask 지역은 생략(전체가 바다) */
  ground?: { kind: 'grass'; color: string; dot: string; mapColor: string };
  /** 지형 마스크 (항해 지역) — ASCII rows를 compileMap으로 컴파일한 격자.
   *  육지·특화 수역 전부 여기로 기술한다. village 같은 walk 지역은 terrain rect를 쓴다. */
  map?: CompiledMap;
  /** 마스크 위 통행판(부두) — sail 지역 장식용 (충돌 영향 없음) */
  decks?: { rect: Rect; style: DeckStyleId }[];
  /** 물결 파티클 수 */
  waveCount: number;
  /** walk 지역용 rect 지형 (village — 물/통행판). mask와 상호배타 */
  terrain?: TerrainPiece[];
  buildings: Building[];
  decorations: Decoration[];
  schools: School[];
  spawn: Point;
  triggers: TriggerDef[]; // 배열 순서 = 검사 순서
  labels: MapLabel[];     // 필드 라벨
  /** 지역 고유 연출 훅 (지역당 1개, 장식 전용 — 지형/건물을 여기서 그리지 말 것) */
  flavor?: (ctx: CanvasRenderingContext2D, t: number) => void;
}

// ---------- 거점 (집/항구) ----------

export type FurnitureSpriteId =
  | 'bookshelf' | 'workbench' | 'chest' | 'door'            // 집
  | 'office' | 'rodshop' | 'market' | 'shipyard' | 'boarding' | 'ferry' | 'shop' | 'board'; // 항구

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
  /** exit로 필드에 나갈 착지점(물 위) — 병합 바다처럼 팩 spawn이 고향 항구 하나뿐일 때
   *  접안했던 항구 앞에서 이어서 나가야 한다. 미지정 = 팩 spawn(구 계약). */
  exitAt?: Point;
  /** 여객선 등 지역 간 이동 시설 (travel 가구가 있을 때만) */
  travel?: { to: RegionId; msg: string };
  furniture: Furniture[];
}
