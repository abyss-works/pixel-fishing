// 지역 1-2: 동남아&오세아니아 (960×540, 항해) — 지구 서태평양을 단순화한 지도. 북=태평양(1-1), 서=인도양(1-3 예정).
// 섬은 rect 한 장이 아니라 **여러 장을 겹쳐 해안선 실루엣**을 만든다(ocean의 유라시아와 같은 패턴) —
// 충돌·수역 판정은 engine이 조각 합집합에서 파생하므로 엔진 무수정.
// 스펙(mgmt/spec/region-1-2-seasia-spec.md §2) 제안 좌표 대비 조정 이력:
//   · 루손 y0→20/h140→120 — 루손 해협 트리거가 물 위에 놓이게(원안은 육지 내부라 도달 불가)
//   · 보르네오 y180→240 — 원안은 접안·스폰(450,190)과 겹침
//   · 산호해 신설(호주 동쪽) + 어종 13종→17종(6/6/5) — 사용자 결정(미출시 튜닝 구간), 상위 문서 역반영
import type { Point, Rect, RegionPack, School, TerrainPiece } from '../types';

export const SEASIA_W = 960, SEASIA_H = 540;

export const SEASIA_LANDS: (Rect & { name?: string })[] = [
  // 수마트라 — 북서→남동 대각 능선
  { x: 70,  y: 200, w: 88, h: 30, name: '수마트라' },
  { x: 60,  y: 224, w: 82, h: 36 },
  { x: 74,  y: 254, w: 86, h: 36 },
  { x: 94,  y: 284, w: 86, h: 36 },
  { x: 114, y: 314, w: 80, h: 34 },
  { x: 134, y: 342, w: 58, h: 34 },
  // 자바 — 얇은 동서 능선, 동쪽으로 가늘어진다
  { x: 280, y: 430, w: 58, h: 32, name: '자바' },
  { x: 332, y: 424, w: 72, h: 40 },
  { x: 398, y: 430, w: 56, h: 34 },
  { x: 448, y: 438, w: 30, h: 24 },
  // 보르네오 — 중앙이 부른 마름모
  { x: 420, y: 240, w: 78, h: 34, name: '보르네오' },
  { x: 396, y: 270, w: 128, h: 48 },
  { x: 380, y: 300, w: 152, h: 44 },
  { x: 404, y: 338, w: 96, h: 42 },
  // 루손 — 남단 y=140 유지(마닐항 배후) + 동·서 돌출 반도
  { x: 410, y: 20, w: 100, h: 38, name: '루손' },
  { x: 400, y: 54, w: 116, h: 44 },
  { x: 408, y: 94, w: 92, h: 30 },
  { x: 424, y: 120, w: 64, h: 20 },
  { x: 498, y: 62, w: 20, h: 44 },
  { x: 386, y: 86, w: 16, h: 28 },
  // 뉴기니 — 서부 새머리 + 본체 + 남동
  { x: 735, y: 164, w: 112, h: 76, name: '뉴기니' },
  { x: 700, y: 192, w: 42, h: 40 },
  { x: 760, y: 232, w: 62, h: 30 },
  { x: 812, y: 230, w: 84, h: 46 },
  // 오세아니아(호주) — 남부 대육지 + 카펀테리아만 사이 + 케이프요크 곶
  { x: 650, y: 458, w: 272, h: 82, name: '오세아니아' },
  { x: 660, y: 420, w: 88, h: 44 },
  { x: 742, y: 398, w: 32, h: 44 },
  { x: 768, y: 420, w: 104, h: 52 },
];

// 코럴 트라이앵글·산호해 외 전부 남중국해 (defaultSpot: 'southchina')
export const CORAL_TRI: Rect = { x: 480, y: 120, w: 220, h: 160 };
export const CORAL_SEA: Rect = { x: 792, y: 288, w: 138, h: 92 }; // 케이프요크 곶과 뉴기니 사이 열린 물

export const MANILA: Rect = { x: 430, y: 140, w: 40, h: 30 };  // 마닐라항 외관(루손 남쪽 해안)
export const M_DOCK: Rect = { x: 438, y: 170, w: 24, h: 12 };  // 접안 트리거(물 위)
export const M_SPAWN: Point = { x: 450, y: 190 };

// 북쪽 경계 전체가 태평양으로 통하는 봉합 출구 (오픈월드 R5c) — 건너면 x를 보존해
// 태평양 남쪽 가장자리에서 등장한다. 말라카 해협(서쪽, 1-3)은 아직 지역이 없어 라벨 예고만.
export const LUZON_STRAIT: Rect = { x: 4, y: 4, w: 952, h: 12 };

export const SEASIA_SCHOOLS: School[] = [
  { id: 'sea-scs-1',   spot: 'southchina', x: 300, y: 300 },
  { id: 'sea-scs-2',   spot: 'southchina', x: 600, y: 350 },
  { id: 'sea-scs-3',   spot: 'southchina', x: 780, y: 300 },  // 산호해 경계 바로 밖 — 남중국해 끝자락
  { id: 'sea-coral-1', spot: 'coral',      x: 560, y: 180 },
  { id: 'sea-coral-2', spot: 'coral',      x: 630, y: 230 },
  { id: 'sea-cs-1',    spot: 'coralsea',   x: 806, y: 306 },
  { id: 'sea-cs-2',    spot: 'coralsea',   x: 872, y: 352 },
];

export const SEASIA: RegionPack = {
  id: 'seasia',
  name: '동남아&오세아니아',
  base: 'manila',
  info: {
    shortName: '동남아',
    tagline: '햇살이 내리쬐는 얕은 바다, 생명이 모이는 곳',
    lore: '루손 해협을 지나면 바다 빛이 달라진다. 남중국해의 드넓은 물길과 코럴 트라이앵글의 에메랄드 암초 — 동남아시아의 관문이다. 항구마다 생선 냄새와 웃음소리가 난다는 말이 있고, 어부들은 산호가 가장 화려한 자리에 전설이 잠들었다고 수군거린다.',
    tips: [
      '코럴 트라이앵글의 밝은 물도 남중국해와 같은 배 등급으로 낚시할 수 있어요.',
      '케이프요크 곶 너머 산호해에는 큰 것이 숨어요.',
      '마닐라항에서 정비할 수 있고, 여객선으로 마을에 다녀올 수 있어요.',
      '서쪽 끝의 말라카 해협은 아직 열리지 않았어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
  },
  w: SEASIA_W,
  h: SEASIA_H,
  movement: 'sail',
  ground: { kind: 'water', style: 'sea' },
  defaultSpot: 'southchina',
  waveCount: 110,
  terrain: [
    { kind: 'water', rect: CORAL_TRI, style: 'coral', spot: 'coral' },
    { kind: 'water', rect: CORAL_SEA, style: 'coral', spot: 'coralsea' },
    ...SEASIA_LANDS.map(l => ({ kind: 'land', rect: { x: l.x, y: l.y, w: l.w, h: l.h }, name: l.name } as TerrainPiece)),
    // 접안 부두 — 항구 아래 물 위 통행판 (sail이라 충돌엔 무영향, 시각용)
    { kind: 'deck', rect: { x: M_DOCK.x + 2, y: MANILA.y + MANILA.h, w: M_DOCK.w - 4, h: 16 }, style: 'pier' },
  ],
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
    { text: '남중국해', x: 285, y: 155, color: 'faint', size: 9 },
    { text: '코럴 트라이앵글', x: 545, y: 132, color: 'faint', size: 9 },
    { text: '산호해', x: 845, y: 298, color: 'faint', size: 9 },
    { text: '말라카 해협 —', x: 14, y: 258, color: 'faint', size: 9 },
    { text: '마닐라항', x: MANILA.x + MANILA.w / 2, y: MANILA.y + 2, color: 'gold', size: 8 },
  ],
  // 지역 고유 연출: 산호수 반짝임 — 유일한 손코딩 허용 지점 (지형/건물 금지, 장식만)
  flavor: (ctx, t) => {
    for (const zone of [CORAL_TRI, CORAL_SEA]) {
      for (let i = 0; i < (zone === CORAL_TRI ? 14 : 8); i++) {
        const sx = zone.x + (i * 43) % zone.w, sy = zone.y + (i * 29) % zone.h;
        if ((Math.sin(t * 2.2 + i * 1.7 + (zone === CORAL_TRI ? 0 : 3)) + 1) / 2 > 0.62) {
          ctx.fillStyle = 'rgba(190,255,238,0.6)';
          ctx.fillRect(sx | 0, sy | 0, 1, 1);
        }
      }
    }
  },
};
