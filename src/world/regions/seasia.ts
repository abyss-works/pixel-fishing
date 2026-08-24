// 지역 1-2: 동남아&오세아니아 (항해) — 루손에서 말라카, 오스트레일리아까지의 실제 해안선.
// 지형·앵커의 단일 근원은 tools/configs/seasia.json → generated/seasia.mask.ts(AUTO-GENERATED).
// 이 파일은 게임 의미론만 기술한다: 문자 해석(legend), 시설 크기, 트리거, 텍스트.
//
// **특화 수역 3개 구조**(사용자 결정): 일반 수역 없음 — 열린 바다는 통행 전용, 군집은 특화 안에만 2개씩.
import type { Point, Rect, RegionPack, School } from '../types';
import { compileMap } from '../mask';
import { CELL_W, CELL_H, MASK_ROWS, ANCHORS } from './generated/seasia.mask';

const A = ANCHORS;

export const SEASIA_MAP = compileMap(CELL_W, CELL_H, {
  '.': {},
  d: { water: true, style: 'deep', spot: 'dragonhole', label: '드래곤 홀' },
  w: { water: true, style: 'wreck', spot: 'coron', label: '코론 침선 지대' },
  r: { water: true, style: 'coral', spot: 'barrierreef', label: '그레이트 배리어 리프' },
  L: { land: true },
}, MASK_ROWS);
export const SEASIA_W = SEASIA_MAP.cols * CELL_W;
export const SEASIA_H = SEASIA_MAP.rows * CELL_H;

export const MANILA: Rect = { ...A.manila, w: 40, h: 41 };      // 마닐라항 외관(루손 서해안)
export const M_DOCK: Rect = { ...A.m_dock, w: 16, h: 15 };      // 접안 트리거(물 위, 건물 서쪽)
export const M_SPAWN: Point = A.m_spawn;

// 북쪽 경계 전체가 태평양으로 통하는 봉합 출구 (오픈월드 R5c) — 건너면 x를 보존해
// 태평양 남쪽 가장자리(봉합 위도 19N)에서 등장한다. 말라카 해협(서남쪽, 1-3)은 아직 지역이 없어 라벨 예고만.
export const LUZON_STRAIT: Rect = { x: 4, y: 6, w: SEASIA_W - 8, h: 17 };

// 특화 수역마다 군집 2개 — 열린 바다는 낚시터가 아니다
export const SEASIA_SCHOOLS: School[] = [
  { id: 'sea-dh-1', spot: 'dragonhole',  ...A.school_dh_1 },
  { id: 'sea-dh-2', spot: 'dragonhole',  ...A.school_dh_2 },
  { id: 'sea-cw-1', spot: 'coron',       ...A.school_cw_1 },
  { id: 'sea-cw-2', spot: 'coron',       ...A.school_cw_2 },
  { id: 'sea-br-1', spot: 'barrierreef', ...A.school_br_1 },
  { id: 'sea-br-2', spot: 'barrierreef', ...A.school_br_2 },
];

export const SEASIA: RegionPack = {
  id: 'seasia',
  name: '동남아&오세아니아',
  base: 'manila',
  info: {
    shortName: '동남아',
    tagline: '햇살이 내리쬐는 얕은 바다, 생명이 모이는 곳',
    lore: '루손 해협을 지나면 바다 빛이 달라진다. 바다 한가운데 탁 파인 검은 구멍 — "드래곤 홀"은 용이 잠든 우물이라 하고, 팔라완 섬 그늘의 코론 바다는 밤마다 철이 우는 소리가 난다고 한다. 그리고 그 너머, 세계에서 가장 화려한 산호 정원이 햇살을 머금고 있다.',
    tips: [
      '세 낚시터(드래곤 홀 · 코론 침선 지대 · 그레이트 배리어 리프)는 모두 통통배로 갈 수 있어요.',
      '코론의 침몰선 틈에는 커다란 것이 숨어 있고, 드래곤 홀에는 용이 잠들었다는 소문이 있어요.',
      '마닐라항에서 정비하고, 여객선으로 마을에 다녀올 수 있어요.',
      '말라카 해협 너머 서쪽 바다는 아직 열리지 않았어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
  },
  w: SEASIA_W,
  h: SEASIA_H,
  movement: 'sail',
  map: SEASIA_MAP,
  decks: [
    // 접안 부두 — 부두가 건물 서쪽 물 위라 가로 통행판으로 연결한다 (sail이라 충돌엔 무영향)
    { rect: { x: M_DOCK.x + M_DOCK.w - 4, y: M_DOCK.y + 3,
              w: Math.max(6, MANILA.x - M_DOCK.x - M_DOCK.w + 8), h: 8 }, style: 'pier' },
  ],
  waveCount: 110,
  buildings: [
    { rect: MANILA, sprite: 'harbor' },
  ],
  decorations: [],
  schools: SEASIA_SCHOOLS,
  spawn: M_SPAWN,
  triggers: [
    { rect: M_DOCK, action: 'base', msg: '마닐라항에 접안했다. 시설을 눌러 정비하자.' },
    { rect: LUZON_STRAIT, action: 'travel', to: 'ocean', requiredBoat: 0,
      msg: '루손 해협을 지나 태평양으로 나왔다.', blockedMsg: '', // requiredBoat 0 = 게이트 없음(이미 배 보유)
      entry: { edge: 'bottom' } },
  ],
  labels: [
    { text: '말라카 해협 —', x: A.label_malacca.x, y: A.label_malacca.y, color: 'faint', size: 9 },
    { text: '마닐라항', x: MANILA.x + MANILA.w / 2, y: MANILA.y + 2, color: 'gold', size: 8 },
  ],
};
