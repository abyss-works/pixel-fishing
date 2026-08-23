// 지역 2: 대양 (960×540, 항해) — 단순화한 지구. 좌표는 구 world.ts에서 값 그대로 이식.
import type { Point, Rect, RegionPack, School, TerrainPiece } from '../types';

export const OCEAN_W = 960, OCEAN_H = 540;

export const LANDS: (Rect & { name?: string })[] = [
  { x: 0,   y: 0,   w: 360, h: 120, name: '유라시아' },
  { x: 0,   y: 100, w: 220, h: 80 },
  { x: 240, y: 90,  w: 60,  h: 40 },
  { x: 285, y: 120, w: 36,  h: 62, name: '한반도' },
  { x: 370, y: 150, w: 18,  h: 40, name: '일본 열도' },
  { x: 395, y: 190, w: 16,  h: 34 },
  { x: 415, y: 230, w: 14,  h: 26 },
  { x: 40,  y: 260, w: 140, h: 140, name: '아프리카' },
  { x: 300, y: 310, w: 40,  h: 24, name: '동남아 제도' },
  { x: 352, y: 340, w: 30,  h: 20 },
  { x: 560, y: 430, w: 110, h: 70, name: '오세아니아' },
  { x: 860, y: 0,   w: 100, h: 540, name: '아메리카' },
  { x: 800, y: 180, w: 80,  h: 70 },
  { x: 820, y: 350, w: 80,  h: 90 },
];

// 마리아나 해구 외 전부 태평양 (defaultSpot: 'sea')
export const TRENCH: Rect = { x: 470, y: 260, w: 170, h: 160 };

export const HARBOR: Rect = { x: 285, y: 150, w: 36, h: 32 };  // 항구 외관(한반도 남단)
export const O_DOCK: Rect = { x: 293, y: 184, w: 20, h: 12 };  // 접안 트리거(물 위)
export const O_SPAWN: Point = { x: 303, y: 206 };

// 남쪽 경계 전체가 동남아로 통하는 봉합 출구 (오픈월드 R5c) — 건너면 x를 보존해
// 동남아 북쪽 가장자리에서 등장한다. 아메리카(x860+) 위칸은 이동 불가라 자연 무효.
export const O_EXIT: Rect = { x: 4, y: 532, w: 952, h: 8 };

export const O_SCHOOLS: School[] = [
  // o-sea-1은 스폰(303,206)에서 캐스팅 사거리(CAST_RANGE 40) 밖에 있어야 한다 — 항구 앞 즉시 낚시 금지
  { id: 'o-sea-1',  spot: 'sea',  x: 352, y: 216 },
  { id: 'o-sea-2',  spot: 'sea',  x: 560, y: 120 },
  { id: 'o-sea-3',  spot: 'sea',  x: 720, y: 300 },
  { id: 'o-deep-1', spot: 'deep', x: 520, y: 320 },
  { id: 'o-deep-2', spot: 'deep', x: 590, y: 380 },
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
  ground: { kind: 'water', style: 'sea' },
  defaultSpot: 'sea',
  waveCount: 110,
  terrain: [
    { kind: 'water', rect: TRENCH, style: 'deep', spot: 'deep' },
    ...LANDS.map(l => ({ kind: 'land', rect: { x: l.x, y: l.y, w: l.w, h: l.h }, name: l.name } as TerrainPiece)),
    // 접안 부두 — 항구 아래 물 위 통행판 (sail이라 충돌엔 무영향, 시각용)
    { kind: 'deck', rect: { x: O_DOCK.x + 2, y: HARBOR.y + HARBOR.h, w: O_DOCK.w - 4, h: 16 }, style: 'pier' },
  ],
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
    { text: '태평양', x: 700, y: 120, color: 'faint', size: 9 },
    { text: '마리아나 해구', x: 555, y: 345, color: 'faint', size: 9 },
    { text: '루손 해협 →', x: 330, y: 524, color: 'faint', size: 8 },
    { text: '항구', x: HARBOR.x + HARBOR.w / 2, y: HARBOR.y + 2, color: 'gold', size: 8 },
  ],
  // 지역 고유 연출: 해구 반짝임 — 유일한 손코딩 허용 지점 (지형/건물 금지, 장식만)
  flavor: (ctx, t) => {
    for (let i = 0; i < 14; i++) {
      const sx = TRENCH.x + (i * 37) % TRENCH.w, sy = TRENCH.y + (i * 61) % TRENCH.h;
      if ((Math.sin(t * 2 + i) + 1) / 2 > 0.6) {
        ctx.fillStyle = 'rgba(140,190,255,0.5)';
        ctx.fillRect(sx | 0, sy | 0, 1, 1);
      }
    }
  },
};
