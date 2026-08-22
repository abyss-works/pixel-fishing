// 지역 1: 마을 (640×360, 도보) — 좌표는 구 world.ts에서 값 그대로 이식 (v0.4.2 스키마화)
// 개별 상수를 export하는 이유: world.test의 고정 좌표 회귀 검증 + 트리거/스폰 참조.
import type { Point, Rect, RegionPack, School } from '../types';

export const VILLAGE_W = 640, VILLAGE_H = 360;

export const V_POND: Rect = { x: 110, y: 95, w: 90, h: 56 };
export const V_RIVER: Rect = { x: 0, y: 200, w: 640, h: 44 };  // 마을을 가로지르는 강
export const V_SEA: Rect = { x: 0, y: 310, w: 640, h: 50 };    // 남쪽 바다(대양 연결) — 낚시 수역 아님
export const V_HOUSE: Rect = { x: 36, y: 28, w: 64, h: 52 };
export const V_DOOR: Rect = { x: 58, y: 80, w: 20, h: 8 };     // 집 진입 트리거
export const V_SPAWN: Point = { x: 68, y: 100 };
export const V_BRIDGE: Rect = { x: 300, y: 196, w: 24, h: 52 }; // 강 다리
export const V_PIER: Rect = { x: 308, y: 304, w: 16, h: 40 };   // 포구 부두(바다 위 보행)
export const V_PORT: Rect = { x: 308, y: 332, w: 16, h: 12 };   // 대양 출항 트리거(배 필요)
export const V_PORT_FRONT: Point = { x: 316, y: 296 };          // 여객선 귀향 도착 지점
// 목공소 — 포구 오른쪽 해안 건물(포구 라벨을 가리지 않게 동쪽 배치). 배 구매는 여기서.
export const V_BOATSHOP: Rect = { x: 374, y: 264, w: 44, h: 34 };
export const V_BOATSHOP_TRIGGER: Rect = { x: 366, y: 270, w: 8, h: 22 }; // 건물 서쪽 문 앞(포구 쪽)

export const V_SCHOOLS: School[] = [
  { id: 'v-pond-1',  spot: 'pond',  x: 150, y: 118 },
  { id: 'v-pond-2',  spot: 'pond',  x: 180, y: 138 },
  { id: 'v-river-1', spot: 'river', x: 100, y: 222 },
  { id: 'v-river-2', spot: 'river', x: 480, y: 222 },
];

export const VILLAGE: RegionPack = {
  id: 'village',
  name: '고향 마을',
  base: 'home',
  info: {
    shortName: '마을',
    tagline: '모든 낚시꾼의 이야기가 시작되는 곳',
    lore: '당신이 나고 자란 조용한 마을. 집 앞 연못과 마을을 가로지르는 강에는 어릴 적부터 봐 온 물고기들이 산다. 하지만 강을 따라 남쪽으로 내려가면 포구 너머로 바다가 열려 있다 — 배 한 척만 있다면.',
    tips: [
      '연못과 강은 배 없이 낚시할 수 있어요.',
      '강 다리를 건너 남쪽 포구로 가면 대양으로 출항할 수 있어요 (배 필요).',
      '포구 옆 목공소에서 배를 살 수 있어요.',
      '집 문 앞에 서면 자동으로 집에 들어가요.',
    ],
    controls: [
      '이동: 방향키 또는 WASD',
      '낚시: 물고기 군집 옆에서 스페이스(또는 화면 클릭)',
    ],
  },
  w: VILLAGE_W,
  h: VILLAGE_H,
  movement: 'walk',
  ground: { kind: 'grass', color: '#74c69d', dot: '#5fb389', mapColor: '#4c7c5e' },
  waveCount: 30,
  terrain: [
    { kind: 'water', rect: V_POND, style: 'pond', spot: 'pond' },
    { kind: 'water', rect: V_RIVER, style: 'river', spot: 'river' },
    { kind: 'water', rect: V_SEA, style: 'sea' }, // 낚시 수역 아님 — 경계/출항용
    { kind: 'deck', rect: V_BRIDGE, style: 'bridge' },
    { kind: 'deck', rect: V_PIER, style: 'pier' },
  ],
  buildings: [
    { rect: V_HOUSE, sprite: 'house' },
    { rect: V_BOATSHOP, sprite: 'boatshop' },
  ],
  decorations: [
    [260, 60], [420, 90], [560, 50], [80, 270], [600, 270], [450, 160],
  ].map(([x, y]) => ({ kind: 'tree' as const, x, y })),
  schools: V_SCHOOLS,
  spawn: V_SPAWN,
  triggers: [
    { rect: V_DOOR, action: 'base', msg: '집이다. 시설을 눌러 정비하자.' },
    { rect: V_PORT, action: 'travel', to: 'ocean', requiredBoat: 1,
      msg: '대양으로 출항! 태평양 군집을 찾아 항해하자.',
      blockedMsg: '대양에 나가려면 배가 필요하다. 포구 옆 목공소에서 조각배를 사자.' },
    { rect: V_BOATSHOP_TRIGGER, action: 'shop' },
  ],
  labels: [
    { text: '포구 — 대양으로', x: V_PIER.x + 8, y: V_PIER.y - 4, color: 'gold', size: 8 },
    { text: '목공소 — 배 만드는 곳', x: V_BOATSHOP.x + V_BOATSHOP.w / 2, y: V_BOATSHOP.y - 4, color: 'gold', size: 8 },
    { text: '집', x: V_HOUSE.x + V_HOUSE.w / 2, y: V_HOUSE.y - 4, color: 'text', size: 8 },
  ],
  mapLabels: [
    { text: '집', x: V_HOUSE.x + V_HOUSE.w / 2, y: V_HOUSE.y - 6, color: 'gold', size: 12 },
    { text: '마을 연못', x: 155, y: 85, color: 'faint', size: 12 },
    { text: '마을 강', x: 480, y: 195, color: 'faint', size: 12 },
    { text: '남쪽 바다 — 포구에서 대양으로', x: 320, y: 305, color: 'faint', size: 12 },
  ],
};
