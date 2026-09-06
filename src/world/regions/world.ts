// 지역: 대양(병합 바다) — 오픈월드화 Phase 3(spec/zones.md). 태평양·동남아&오세아니아·인도양
// 세 바다가 **하나의 항해 지역**이 되고, 구 travel 트리거(루손 해협·말라카 해협)는 소멸한다.
// 지형·앵커의 단일 근원은 tools/configs/world.json → generated/world.mask.ts(AUTO-GENERATED).
// 이 파일은 게임 의미론만 기술한다: 문자 해석(legend), 시설 크기, 트리거, 텍스트.
//
// 구역 경계는 셀의 zone 문자로 인코딩된다(1=태평양 2=동남아 열린 바다 3=인도양). 경계 통과
// 게이트는 Field의 구역 전이 판정(zoneOf)이 맡고, 자격 기준은 zones.ts entryBoat다(Q5 —
// 클라 연출 + 서버 하한 검증은 spots.boatTier가 그대로 유지).
// 4/5/6 = 구역 라벨 전용 문자 — 물(통행 가능)이지만 spot이 없어 낚시 불가, 눈에 보이지 않는다.
import type { MapCellDef, Point, Rect, RegionPack, School } from '../types';
import { compileMap } from '../mask';
import { CELL_W, CELL_H, MASK_ROWS, ANCHORS, WINDOW } from './generated/world.mask';

const A = ANCHORS;

// 마스크 문자 해석(legend) — **셀은 존만** 안다(spec/zone-tree.md: 스팟은 셀 범위가 아니라
// 존 안에 배치되는 어군 오브젝트라 셀에 새기지 않는다). 캐스팅 판정은 학교(schools)가 담당.
// world.json과 earth.json(extends 상속)이 같은 문자 체계를 쓰므로 단일 출처로 내보낸다 —
// 세계지도(atlas.ts)가 earth 마스크를 같은 legend로 컴파일한다.
// 하위 존 문자(t/d/w/r/s)는 이제 하위 존의 범위다 — 셀 zone이 하위 존을 가리키고
// 스팟은 그 존에 배치된 어군이다. '4'/'5'/'6' = 최상위 존 라벨 전용 문자(물이지만 통행만).
export const WORLD_LEGEND: Record<string, MapCellDef> = {
  '1': { water: true, style: 'sea', zone: 'pacific' },
  '2': { water: true, style: 'sea', zone: 'seasia' },           // 열린 바다 통행 전용 — 최상위 스팟 없음
  '3': { water: true, style: 'sea', zone: 'indian' },
  t: { water: true, style: 'deep', zone: 'deep', label: '마리아나 해구' },
  d: { water: true, style: 'deep', zone: 'dragonhole', label: '드래곤 홀' },
  w: { water: true, style: 'wreck', zone: 'coron', label: '코론 침선 지대' },
  r: { water: true, style: 'coral', zone: 'barrierreef', label: '그레이트 배리어 리프' },
  s: { water: true, style: 'deep', zone: 'southindian', label: '남인도양' },
  '4': { water: true, style: 'sea', zone: 'pacific', label: '태평양' },
  '5': { water: true, style: 'sea', zone: 'seasia', label: '동남아&오세아니아' },
  '6': { water: true, style: 'sea', zone: 'indian', label: '인도양' },
  L: { land: true },
  '.': { water: true, style: 'sea' }, // 구역 밖 잉여 물(내륙해 등) — 통행만, 낚시·구역 아님
};

export const WORLD_MAP = compileMap(CELL_W, CELL_H, WORLD_LEGEND, MASK_ROWS);
export const WORLD_W = WORLD_MAP.cols * CELL_W;
export const WORLD_H = WORLD_MAP.rows * CELL_H;

export const HARBOR: Rect = { ...A.harbor, w: 36, h: 28 };      // 항구 외관(한반도 남동 해안)
export const HARBOR_DOCK: Rect = { ...A.dock, w: 20, h: 17 };   // 접안 트리거(물 위)
export const WORLD_SPAWN: Point = A.spawn;

export const MANILA: Rect = { ...A.manila, w: 40, h: 41 };      // 마닐라항 외관(루손 서해안)
export const MANILA_DOCK: Rect = { ...A.m_dock, w: 16, h: 15 };
export const MANILA_SPAWN: Point = A.m_spawn;

export const COLOMBO: Rect = { ...A.colombo, w: 40, h: 41 };    // 콜롬보 항 외관(스리랑카 서해안)
export const COLOMBO_DOCK: Rect = { ...A.c_dock, w: 16, h: 15 };
export const COLOMBO_SPAWN: Point = A.c_spawn;

// 특화 수역 군집 2개씩 + 일반 수역(연안) 2~3개 — 구 3지역의 군집을 그대로 계승한다.
// 군집 좌표는 앵커 파생 — 생성기가 물 위 배치를 보증한다(terrain 검증).
export const WORLD_SCHOOLS: School[] = [
  { id: 'w-sea-1',  spot: 'sea',  ...A.school_sea_1 },
  { id: 'w-sea-2',  spot: 'sea',  ...A.school_sea_2 },
  { id: 'w-sea-3',  spot: 'sea',  ...A.school_sea_3 },
  { id: 'w-deep-1', spot: 'deep', ...A.school_deep_1 },
  { id: 'w-deep-2', spot: 'deep', ...A.school_deep_2 },
  { id: 'w-dh-1',   spot: 'dragonhole',  ...A.school_dh_1 },
  { id: 'w-dh-2',   spot: 'dragonhole',  ...A.school_dh_2 },
  { id: 'w-cw-1',   spot: 'coron',       ...A.school_cw_1 },
  { id: 'w-cw-2',   spot: 'coron',       ...A.school_cw_2 },
  { id: 'w-br-1',   spot: 'barrierreef', ...A.school_br_1 },
  { id: 'w-br-2',   spot: 'barrierreef', ...A.school_br_2 },
  { id: 'w-i-1',    spot: 'indian',      ...A.school_i_1 },
  { id: 'w-i-2',    spot: 'indian',      ...A.school_i_2 },
  { id: 'w-s-1',    spot: 'southindian', ...A.school_s_1 },
  { id: 'w-s-2',    spot: 'southindian', ...A.school_s_2 },
];

export const WORLD: RegionPack = {
  id: 'world',
  name: '대양',
  base: 'harbor',
  info: {
    shortName: '대양',
    tagline: '세계의 바다가 하나로 이어진다',
    lore: '한 배로 건너는 세계의 바다. 지역 탭은 지금 서 있는 물의 이야기를 들려준다.',
    tips: [],
    controls: [],
  },
  w: WORLD_W,
  h: WORLD_H,
  geoWindow: WINDOW,
  movement: 'sail',
  map: WORLD_MAP,
  decks: [
    // 접안 부두 ×3 — 시각용 통행판(sail이라 충돌엔 무영향). 구 3지역의 부두 공식을 계승.
    { rect: { x: HARBOR_DOCK.x + 2, y: HARBOR.y + HARBOR.h, w: HARBOR_DOCK.w - 4, h: 22 },
      style: 'pier' },
    { rect: { x: MANILA_DOCK.x + MANILA_DOCK.w - 4, y: MANILA_DOCK.y + 3,
              w: Math.max(6, MANILA.x - MANILA_DOCK.x - MANILA_DOCK.w + 8), h: 8 }, style: 'pier' },
    { rect: { x: COLOMBO_DOCK.x + COLOMBO_DOCK.w - 4, y: COLOMBO_DOCK.y + 3,
              w: Math.max(6, COLOMBO.x - COLOMBO_DOCK.x - COLOMBO_DOCK.w + 8), h: 8 }, style: 'pier' },
  ],
  waveCount: 480, // 열린 바다 지도 전체 순환 — 면적 비례(2배 확대 대응. 뷰포트 밖은 캔버스가 클리핑)
  buildings: [
    { rect: HARBOR, sprite: 'harbor' },
    { rect: MANILA, sprite: 'harbor' },
    { rect: COLOMBO, sprite: 'harbor' },
  ],
  decorations: [],
  schools: WORLD_SCHOOLS,
  spawn: WORLD_SPAWN,
  // travel 트리거 없음 — 구역 경계 게이트(Field zoneOf 전이 판정)가 대체한다.
  // 접안 트리거만 3개 — trig.base로 거점을 지정한다(팩 base는 고향 항구가 기본값).
  triggers: [
    { rect: HARBOR_DOCK, action: 'base', base: 'harbor',
      msg: '항구에 접안했다. 시설을 눌러 정비하자.' },
    { rect: MANILA_DOCK, action: 'base', base: 'manila',
      msg: '마닐라항에 접안했다. 시설을 눌러 정비하자.' },
    { rect: COLOMBO_DOCK, action: 'base', base: 'colombo',
      msg: '콜롬보 항에 접안했다. 시설을 눌러 정비하자.' },
  ],
  labels: [
    { text: '항구', x: HARBOR.x + HARBOR.w / 2, y: HARBOR.y + 2, color: 'gold', size: 8 },
    { text: '마닐라항', x: MANILA.x + MANILA.w / 2, y: MANILA.y + 2, color: 'gold', size: 8 },
    { text: '콜롬보 항', x: COLOMBO.x + COLOMBO.w / 2, y: COLOMBO.y + 2, color: 'gold', size: 8 },
    // 구역 경계 라벨 — 구 travel 트리거 안내문의 계승(고도화 A-1). 경계는 보이지 않는 선이라
    // 통로 지점에 게이트 요구 배를 예고한다(좌표는 config 앵커 — 하드코딩 금지).
    // 필리핀 동쪽 19N은 광활한 열린 바다라 경계임이 안 보였다(사용자 피드백) — 라벨 추가.
    { text: '루손 해협 → 동남아 (배 3)', x: A.label_luzon.x, y: A.label_luzon.y,
      color: 'faint', size: 8 },
    { text: '서쪽 물길 → 동남아 (배 3)', x: A.label_formosa.x, y: A.label_formosa.y,
      color: 'faint', size: 8 },
    { text: '남쪽 물길 → 동남아 (배 3)', x: A.label_philippine.x, y: A.label_philippine.y,
      color: 'faint', size: 8 },
    { text: '말라카 해협 → 인도양 (배 5)', x: A.label_malacca.x, y: A.label_malacca.y,
      color: 'faint', size: 8 },
  ],
};
