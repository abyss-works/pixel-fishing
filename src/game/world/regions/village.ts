// 지역 1: 마을 (448×360, 도보) — 너비는 필드 화면 한 장이라 가로로 스크롤하지 않는다
// 개별 상수를 export하는 이유: world.test의 고정 좌표 회귀 검증 + 트리거/스폰 참조.
import type { Point, Rect, RegionPack, School } from '../types';

export const VILLAGE_W = 448, VILLAGE_H = 360;

export const V_POND: Rect = { x: 174, y: 95, w: 90, h: 56 };
export const V_RIVER: Rect = { x: 0, y: 200, w: 448, h: 44 };  // 마을을 가로지르는 강
export const V_SEA: Rect = { x: 0, y: 310, w: 448, h: 50 };    // 남쪽 바다(대양 연결) — 낚시 수역 아님
export const V_HOUSE: Rect = { x: 100, y: 28, w: 64, h: 52 };
export const V_DOOR: Rect = { x: 122, y: 80, w: 20, h: 8 };     // 집 진입 트리거
export const V_SPAWN: Point = { x: 132, y: 100 };
// 다리·부두·출항 지점은 마을 가로 가운데에 한 줄로 놓는다
export const V_BRIDGE: Rect = { x: 212, y: 196, w: 24, h: 52 }; // 강 다리
export const V_PIER: Rect = { x: 216, y: 304, w: 16, h: 40 };   // 포구 부두(바다 위 보행)
export const V_PORT: Rect = { x: 216, y: 332, w: 16, h: 12 };   // 대양 출항 트리거(배 필요)
export const V_PORT_FRONT: Point = { x: 224, y: 296 };          // 여객선 귀향 도착 지점

// 마을 어군은 고정이다 — 대양과 달리 날짜 시드 배치의 범위 밖(schoolsOf가 그대로 돌려준다)
export const V_SCHOOLS: School[] = [
  { id: 'v-pond-1',  spot: 'pond',  x: 214, y: 118 },
  { id: 'v-pond-2',  spot: 'pond',  x: 244, y: 138 },
  { id: 'v-river-1', spot: 'river', x: 100, y: 222 },
];

export const VILLAGE: RegionPack = {
  id: 'village',
  name: '고향 마을',
  base: 'home',
  info: {
    shortName: '마을',
    tagline: '모든 낚시꾼의 이야기가 시작되는 곳',
    lore: '낚시꾼들이 나고 자란 조용한 마을. 집 앞 연못과 마을을 가로지르는 강에는 어릴 적부터 봐 온 물고기들이 산다. 하지만 강을 따라 남쪽으로 내려가면 포구 너머로 바다가 열려 있다. 배 한 척만 있다면.',
    tips: [
      '연못과 강은 배 없이 낚시할 수 있어요.',
      '강 다리를 건너 남쪽 포구로 가면 대양으로 출항할 수 있어요 (배 필요).',
      '배는 집의 목공소에서 살 수 있어요.',
      '집 문 앞에 서면 자동으로 집에 들어가요.',
    ],
    controls: [
      '이동: 방향키 또는 WASD',
      '낚시: 어군 옆에서 스페이스(또는 화면 누르기)',
    ],
  },
  w: VILLAGE_W,
  h: VILLAGE_H,
  movement: 'walk',
  ground: { kind: 'grass', color: '#74c69d', dot: '#5fb389', mapColor: '#4c7c5e' },
  waveCount: 30,
  terrain: [
    { kind: 'water', rect: V_POND, style: 'pond' },   // 낚시 대상은 어군(학교) — 물은 지형일 뿐
    { kind: 'water', rect: V_RIVER, style: 'river' },
    { kind: 'water', rect: V_SEA, style: 'sea' },     // 남쪽 바다(대양 연결) — 낚시 수역 아님
    { kind: 'deck', rect: V_BRIDGE, style: 'bridge' },
    { kind: 'deck', rect: V_PIER, style: 'pier' },
  ],
  buildings: [
    { rect: V_HOUSE, sprite: 'house' },
  ],
  decorations: [
    [40, 70], [330, 60], [400, 130], [80, 270], [380, 280],
  ].map(([x, y]) => ({ kind: 'tree' as const, x, y })),
  spawn: V_SPAWN,
  triggers: [
    { rect: V_DOOR, action: 'base', msg: '집이에요. 가구를 눌러 정비해 보세요.' },
    { rect: V_PORT, action: 'travel', to: 'world', requiredBoat: 1,
      msg: '대양으로 출항했어요. 어군을 찾아 항해해 보세요.',
      blockedMsg: '바다에 나가려면 배가 필요해요. 집의 목공소에서 조각배를 구매해 보세요.' },
  ],
  labels: [
    { text: '포구 — 대양으로', x: V_PIER.x + 8, y: V_PIER.y - 4, color: 'gold', size: 8 },
    { text: '집', x: V_HOUSE.x + V_HOUSE.w / 2, y: V_HOUSE.y - 4, color: 'text', size: 8 },
  ],
};
