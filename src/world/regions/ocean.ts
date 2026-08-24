// 지역 1-1: 태평양 (항해) — 한반도 근해에서 마리아나 해구까지의 실제 해안선.
// 지형·앵커의 단일 근원은 tools/configs/ocean.json → generated/ocean.mask.ts(AUTO-GENERATED).
// 이 파일은 게임 의미론만 기술한다: 문자 해석(legend), 시설 크기, 트리거, 텍스트.
import type { Point, Rect, RegionPack, School } from '../types';
import { compileMap } from '../mask';
import { CELL_W, CELL_H, MASK_ROWS, ANCHORS } from './generated/ocean.mask';

const A = ANCHORS;

export const OCEAN_MAP = compileMap(CELL_W, CELL_H, {
  '.': { water: true, style: 'sea', spot: 'sea' },
  t: { water: true, style: 'deep', spot: 'deep', label: '마리아나 해구' },
  L: { land: true },
}, MASK_ROWS);
export const OCEAN_W = OCEAN_MAP.cols * CELL_W;
export const OCEAN_H = OCEAN_MAP.rows * CELL_H;

export const HARBOR: Rect = { ...A.harbor, w: 36, h: 28 };      // 항구 외관(한반도 남동 해안)
export const O_DOCK: Rect = { ...A.dock, w: 20, h: 17 };        // 접안 트리거(물 위)
export const O_SPAWN: Point = A.spawn;

// 남쪽 경계 전체가 동남아로 통하는 봉합 출구 (오픈월드 R5c) — 건너면 x를 보존해
// 동남아 북쪽 가장자리(봉합 위도 19N = 루손 해협)에서 등장한다.
export const O_EXIT: Rect = { x: 4, y: OCEAN_H - 22, w: OCEAN_W - 8, h: CELL_H };

export const O_SCHOOLS: School[] = [
  // 군집 좌표는 앵커 파생 — 생성기가 물 위 배치를 보증한다(terrain 검증).
  { id: 'o-sea-1',  spot: 'sea',  ...A.school_sea_1 },
  { id: 'o-sea-2',  spot: 'sea',  ...A.school_sea_2 },
  { id: 'o-sea-3',  spot: 'sea',  ...A.school_sea_3 },
  { id: 'o-deep-1', spot: 'deep', ...A.school_deep_1 },
  { id: 'o-deep-2', spot: 'deep', ...A.school_deep_2 },
];

export const OCEAN: RegionPack = {
  id: 'ocean',
  name: '태평양 연안',
  base: 'harbor',
  info: {
    shortName: '태평양',
    tagline: '익숙한 바다, 그러나 그 아래는 아직 아무도 모른다',
    lore: '한반도 남단 항구에서 출항한 넓은 태평양. 낮에는 고등어 떼가 수면을 스치지만, 해도에는 "마리아나 해구"라 적힌 검은 물이 있다. 그 깊이의 바닥까지 내려가 본 낚시꾼은 아직 없다.',
    tips: [
      '항해 속도는 배가 좋을수록 빨라져요.',
      '어두운 물(마리아나 해구)은 더 튼튼한 배가 있어야 낚시할 수 있어요.',
      '항구에 접안하면 정비(판매·강화·조선소)를 할 수 있고, 여객선으로 마을에 돌아갈 수 있어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
  },
  w: OCEAN_W,
  h: OCEAN_H,
  movement: 'sail',
  map: OCEAN_MAP,
  decks: [
    // 접안 부두 — 항구 아래 물 위 통행판 (sail이라 충돌엔 무영향, 시각용)
    { rect: { x: O_DOCK.x + 2, y: HARBOR.y + HARBOR.h, w: O_DOCK.w - 4, h: 22 }, style: 'pier' },
  ],
  waveCount: 110,
  buildings: [
    { rect: HARBOR, sprite: 'harbor' },
  ],
  decorations: [],
  schools: O_SCHOOLS,
  spawn: O_SPAWN,
  triggers: [
    { rect: O_DOCK, action: 'base', msg: '항구에 접안했다. 시설을 눌러 정비하자.' },
    { rect: O_EXIT, action: 'travel', to: 'seasia', requiredBoat: 3,
      msg: '남쪽 물길을 따라 동남아로 들어섰다.',
      blockedMsg: '통통배(3단계)가 있어야 남쪽 물길을 지날 수 있다.',
      entry: { edge: 'top' } },
  ],
  labels: [
    { text: '태평양', x: A.label_pacific.x, y: A.label_pacific.y, color: 'faint', size: 9 },
    { text: '남쪽 물길 → 동남아', x: A.label_south.x, y: A.label_south.y, color: 'faint', size: 8 },
    { text: '항구', x: HARBOR.x + HARBOR.w / 2, y: HARBOR.y + 2, color: 'gold', size: 8 },
  ],
};
