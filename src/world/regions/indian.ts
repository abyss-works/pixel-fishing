// 지역 1-3: 인도양 (항해) — 아라비아에서 말라카, 남인도양까지의 실제 해안선.
// 지형·앵커의 단일 근원은 tools/configs/indian.json → generated/indian.mask.ts(AUTO-GENERATED).
// 이 파일은 게임 의미론만 기술한다: 문자 해석(legend), 시설 크기, 트리거, 텍스트.
//
// 수역 구성은 "지역당 2개" 원칙 복귀(1-2만 특화 3수역 예외): 인도양 연안(일반) + 남인도양(특화).
// 서쪽 끝은 희망봉 방향 라벨 예고(1-4 대서양은 미설계 — 창 밖 경계를 막힌 벽처럼 보이지 않게).
import type { Point, Rect, RegionPack, School } from '../types';
import { compileMap } from '../mask';
import { CELL_W, CELL_H, MASK_ROWS, ANCHORS } from './generated/indian.mask';

const A = ANCHORS;

export const INDIAN_MAP = compileMap(CELL_W, CELL_H, {
  '.': { water: true, style: 'sea', spot: 'indian' },
  s: { water: true, style: 'deep', spot: 'southindian', label: '남인도양' },
  L: { land: true },
}, MASK_ROWS);
export const INDIAN_W = INDIAN_MAP.cols * CELL_W;
export const INDIAN_H = INDIAN_MAP.rows * CELL_H;

export const COLOMBO: Rect = { ...A.colombo, w: 40, h: 41 };    // 콜롬보 항 외관(스리랑카 서해안)
export const C_DOCK: Rect = { ...A.c_dock, w: 16, h: 15 };      // 접안 트리거(물 위)
export const C_SPAWN: Point = A.c_spawn;

// 동쪽 경계 전폭 = seasia(말라카 해협)로 통하는 봉합 출구 (오픈월드 R5c).
// 이번엔 처음으로 **좌우(left/right) 봉합**이다 — edge=right/left, y 좌표가 보존된다.
// 봉합 경도: indian lonMax 103E ⇄ seasia lonMin 93E — 겹침 창(93~103E)이 말라카 해협 물길.
export const SUNDA_EXIT: Rect = { x: INDIAN_W - 22, y: 4, w: CELL_W, h: INDIAN_H - 8 };

export const INDIAN_SCHOOLS: School[] = [
  // 군집 좌표는 앵커 파생 — 생성기가 물 위 배치를 보증한다(terrain 검증).
  { id: 'ind-i-1', spot: 'indian',      ...A.school_i_1 },
  { id: 'ind-i-2', spot: 'indian',      ...A.school_i_2 },
  { id: 'ind-s-1', spot: 'southindian', ...A.school_s_1 },
  { id: 'ind-s-2', spot: 'southindian', ...A.school_s_2 },
];

export const INDIAN: RegionPack = {
  id: 'indian',
  name: '인도양',
  base: 'colombo',
  info: {
    shortName: '인도양',
    tagline: '향신료의 바다 — 남으로 갈수록 물이 차가워진다',
    lore: '말라카 해협을 지나면 바다가 넓어진다. 항구마다 후추와 계피 냄새가 배어 있고, 몬순은 옛부터 뱃사람의 시계였다. 그리고 남쪽 — 회청색으로 식어가는 물에는 아직 이름 붙지 않은 무언가가 산다고 한다.',
    tips: [
      '인도양 연안은 열려 있지만, 차가운 남인도양은 더 튼튼한 낚싯대가 필요해요.',
      '콜롬보 항에서 정비하고, 여객선으로 마을에 다녀올 수 있어요.',
      '동쪽 물길을 따라 돌아가면 동남아입니다.',
      '서쪽 수평선 너머는 아직 열리지 않았어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
  },
  w: INDIAN_W,
  h: INDIAN_H,
  movement: 'sail',
  map: INDIAN_MAP,
  decks: [
    // 접안 부두 — 부두가 건물 서쪽 물 위라 가로 통행판으로 연결한다(seasia 마닐라 선례)
    { rect: { x: C_DOCK.x + C_DOCK.w - 4, y: C_DOCK.y + 3,
              w: Math.max(6, COLOMBO.x - C_DOCK.x - C_DOCK.w + 8), h: 8 }, style: 'pier' },
  ],
  waveCount: 110,
  buildings: [
    { rect: COLOMBO, sprite: 'harbor' },
  ],
  decorations: [],
  schools: INDIAN_SCHOOLS,
  spawn: C_SPAWN,
  triggers: [
    { rect: C_DOCK, action: 'base', msg: '콜롬보 항에 접안했다. 시설을 눌러 정비하자.' },
    { rect: SUNDA_EXIT, action: 'travel', to: 'seasia', requiredBoat: 0,
      msg: '동쪽 물길을 따라 말라카 해협으로 나왔다.', blockedMsg: '',
      entry: { edge: 'left' } }, // requiredBoat 0 = 게이트 없음(1-3에 온 유저는 이미 배 보유)
  ],
  labels: [
    { text: '— 희망봉', x: 24, y: Math.round(INDIAN_H * 0.42), color: 'faint', size: 9 },
    { text: '인도양', x: Math.round(INDIAN_W * 0.35), y: Math.round(INDIAN_H * 0.28),
      color: 'faint', size: 10 },
    { text: '남인도양 — 물이 차갑다', x: A.label_malacca.x - 380, y: A.label_malacca.y + 300,
      color: 'faint', size: 8 },
    { text: '콜롬보 항', x: COLOMBO.x + COLOMBO.w / 2, y: COLOMBO.y + 2, color: 'gold', size: 8 },
  ],
};
