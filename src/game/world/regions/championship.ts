// 이벤트 전용 구역: 강태공 분지 호수 — 백두산 천지형 화구호 + 겨울·크리스마스 산타 동산 컨셉.
import type { Point, Rect, RegionPack, School } from '../types';

export const CHAMPIONSHIP_W = 464;
export const CHAMPIONSHIP_H = 288;

export const CHAMPIONSHIP_CABIN: Rect = { x: 200, y: 24, w: 64, h: 52 };
export const CHAMPIONSHIP_SPAWN: Point = { x: 232, y: 94 };

export const CHAMPIONSHIP_SCHOOLS: School[] = [
  { id: 'ch-1', spot: 'championship', x: 160, y: 126 },
  { id: 'ch-2', spot: 'championship', x: 304, y: 126 },
  { id: 'ch-3', spot: 'championship', x: 126, y: 172 },
  { id: 'ch-4', spot: 'championship', x: 338, y: 172 },
  { id: 'ch-5', spot: 'championship', x: 186, y: 218 },
  { id: 'ch-6', spot: 'championship', x: 278, y: 218 },
];

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
};

// 16px 격자 단위 계단형 눈 테두리 깊이(464 = 29×16, 288 = 18×16)
const TOP_SNOW_STEPS = [
  60, 64, 58, 62, 66, 60, 56, 64, 68, 72, 74, 70, 72, 76, 74, 76, 72, 70, 74, 72, 68, 64, 56, 60, 66, 62, 58, 64, 60,
];
const BOT_SNOW_STEPS = [
  26, 24, 28, 24, 22, 26, 28, 24, 22, 24, 26, 24, 22, 24, 22, 24, 22, 24, 26, 24, 22, 24, 28, 26, 22, 24, 28, 24, 26,
];
const SIDE_SNOW_STEPS = [
  52, 48, 54, 46, 50, 44, 48, 52, 46, 44, 48, 50, 46, 48, 52, 48, 54, 50,
];

function drawOuterSnowRing(ctx: CanvasRenderingContext2D) {
  // 안쪽 호수 주변 초록 보행로의 은은한 이끼 점
  for (let i = 0; i < 42; i++) {
    const mx = 56 + ((i * 79 + 13) % (CHAMPIONSHIP_W - 112));
    const my = 78 + ((i * 53 + 7) % (CHAMPIONSHIP_H - 106));
    rect(ctx, mx, my, 2, 2, '#4c826a');
  }

  // 1) 초록 경계 음영(#9bb3c5) — 눈 테두리 안쪽 가장자리 3px
  const shadow = '#9bb3c5';
  for (let i = 0; i < TOP_SNOW_STEPS.length; i++) {
    const x = i * 16;
    rect(ctx, x, 0, 16, TOP_SNOW_STEPS[i] + 3, shadow);
    rect(ctx, x, CHAMPIONSHIP_H - BOT_SNOW_STEPS[i] - 3, 16, BOT_SNOW_STEPS[i] + 3, shadow);
  }
  for (let j = 0; j < SIDE_SNOW_STEPS.length; j++) {
    const y = j * 16;
    rect(ctx, 0, y, SIDE_SNOW_STEPS[j] + 3, 16, shadow);
    rect(ctx, CHAMPIONSHIP_W - SIDE_SNOW_STEPS[j] - 3, y, SIDE_SNOW_STEPS[j] + 3, 16, shadow);
  }

  // 2) 눈 테두리 본체(#cedee9) — 네 모서리가 끊김 없이 이어지는 4면 설원 외곽
  const body = '#cedee9';
  for (let i = 0; i < TOP_SNOW_STEPS.length; i++) {
    const x = i * 16;
    rect(ctx, x, 0, 16, TOP_SNOW_STEPS[i], body);
    rect(ctx, x, CHAMPIONSHIP_H - BOT_SNOW_STEPS[i], 16, BOT_SNOW_STEPS[i], body);
  }
  for (let j = 0; j < SIDE_SNOW_STEPS.length; j++) {
    const y = j * 16;
    rect(ctx, 0, y, SIDE_SNOW_STEPS[j], 16, body);
    rect(ctx, CHAMPIONSHIP_W - SIDE_SNOW_STEPS[j], y, SIDE_SNOW_STEPS[j], 16, body);
  }

  // 3) 눈 하이라이트(#e0edf6)
  const highlight = '#e0edf6';
  for (let i = 0; i < TOP_SNOW_STEPS.length; i++) {
    const x = i * 16 + 2;
    rect(ctx, x, 10, 12, Math.max(8, TOP_SNOW_STEPS[i] - 24), highlight);
    rect(ctx, x, CHAMPIONSHIP_H - BOT_SNOW_STEPS[i] + 5, 12, Math.max(6, BOT_SNOW_STEPS[i] - 12), highlight);
  }
  for (let j = 0; j < SIDE_SNOW_STEPS.length; j++) {
    const y = j * 16 + 2;
    const w = Math.max(8, SIDE_SNOW_STEPS[j] - 22);
    rect(ctx, 10, y, w, 12, highlight);
    rect(ctx, CHAMPIONSHIP_W - SIDE_SNOW_STEPS[j] + 10, y, w, 12, highlight);
  }
}

function drawCraterRim(ctx: CanvasRenderingContext2D) {
  // 외곽 현무암 화구호 능선과 눈 덮인 산등성이
  const basalt = '#4a5568';
  const darkRock = '#374151';
  const snowCap = '#dfecf5';
  for (let x = 0; x < CHAMPIONSHIP_W; x += 16) {
    const peak = 6 + ((x * 7) % 4);
    rect(ctx, x, 0, 16, peak, darkRock);
    rect(ctx, x + 1, 2, 14, Math.max(3, peak - 3), basalt);
    rect(ctx, x + 2, 0, 11, 3, snowCap);

    const southH = 6 + ((x * 5) % 4);
    rect(ctx, x, CHAMPIONSHIP_H - southH, 16, southH, darkRock);
    rect(ctx, x + 1, CHAMPIONSHIP_H - southH + 2, 14, Math.max(3, southH - 3), basalt);
    rect(ctx, x + 3, CHAMPIONSHIP_H - southH, 10, 3, snowCap);
  }
  for (let y = 12; y < CHAMPIONSHIP_H - 12; y += 16) {
    const sideW = 7 + ((y * 3) % 4);
    rect(ctx, 0, y, sideW, 16, darkRock);
    rect(ctx, 0, y + 2, sideW - 2, 12, basalt);
    rect(ctx, 2, y + 2, 3, 9, snowCap);

    rect(ctx, CHAMPIONSHIP_W - sideW, y, sideW, 16, darkRock);
    rect(ctx, CHAMPIONSHIP_W - sideW + 2, y + 2, sideW - 2, 12, basalt);
    rect(ctx, CHAMPIONSHIP_W - 5, y + 2, 3, 9, snowCap);
  }
}

function drawLakeFrostRim(ctx: CanvasRenderingContext2D) {
  // 호수 둘레 서리·살얼음 가장자리 및 데크 위 눈가루
  const frost = '#d5e6f2';
  const ice = '#9bc5e2';
  rect(ctx, 152, 106, 160, 2, frost);
  rect(ctx, 152, 108, 160, 2, ice);
  rect(ctx, 120, 118, 32, 2, frost);
  rect(ctx, 312, 118, 32, 2, frost);
  rect(ctx, 100, 134, 20, 2, frost);
  rect(ctx, 344, 134, 20, 2, frost);

  rect(ctx, 152, 236, 72, 2, ice);
  rect(ctx, 240, 236, 72, 2, ice);
  rect(ctx, 120, 224, 32, 2, ice);
  rect(ctx, 312, 224, 32, 2, ice);

  // 세 곳 낚시 데크 끝 눈가루 장식
  rect(ctx, 84, 164, 10, 2, frost);
  rect(ctx, 370, 164, 10, 2, frost);
  rect(ctx, 224, 244, 16, 2, frost);
}

function drawSantaCabinDetail(ctx: CanvasRenderingContext2D, t: number) {
  const r = CHAMPIONSHIP_CABIN;
  // 눈 덮인 지붕과 고드름
  rect(ctx, r.x - 5, r.y - 2, r.w + 10, 7, '#dfecf5');
  rect(ctx, r.x - 3, r.y + 5, r.w + 6, 3, '#bdd3e4');
  for (let i = 0; i < 6; i++) {
    rect(ctx, r.x + 2 + i * 11, r.y + 16, 2, 2 + (i % 2), '#d5e6f2');
  }
  // 따뜻한 등불 창문
  rect(ctx, r.x + 7, r.y + 23, 14, 14, '#5d4037');
  rect(ctx, r.x + 9, r.y + 25, 10, 10, '#ffd54f');
  rect(ctx, r.x + 11, r.y + 27, 6, 6, '#fff3b0');
  rect(ctx, r.x + 13, r.y + 25, 2, 10, '#5d4037');
  rect(ctx, r.x + 9, r.y + 29, 10, 2, '#5d4037');
  // 크리스마스 화환과 붉은 리본
  rect(ctx, r.x + 28, r.y + 22, 8, 8, '#2e7d32');
  rect(ctx, r.x + 30, r.y + 24, 4, 4, '#4e342e');
  rect(ctx, r.x + 30, r.y + 21, 4, 2, '#e53935');
  // 벽돌 굴뚝과 굴뚝 연기
  rect(ctx, r.x + r.w - 14, r.y - 8, 8, 10, '#795548');
  rect(ctx, r.x + r.w - 15, r.y - 9, 10, 2, '#dfecf5');
  for (let i = 0; i < 4; i++) {
    const phase = (t * 0.45 + i * 0.25) % 1;
    const sx = r.x + r.w - 11 + Math.sin(phase * Math.PI * 2 + i) * 3;
    const sy = r.y - 12 - phase * 18;
    const size = phase < 0.5 ? 3 : 4;
    ctx.fillStyle = `rgba(223, 236, 245, ${(1 - phase) * 0.6})`;
    ctx.fillRect(sx | 0, sy | 0, size, size);
  }
}

function drawSnowfall(ctx: CanvasRenderingContext2D, t: number) {
  for (let i = 0; i < 32; i++) {
    const baseX = (i * 73 + 19) % CHAMPIONSHIP_W;
    const speed = 11 + (i % 4) * 3;
    const sx = (baseX + Math.sin(t * 0.9 + i) * 6 + CHAMPIONSHIP_W) % CHAMPIONSHIP_W;
    const sy = (i * 41 + t * speed) % CHAMPIONSHIP_H;
    const size = i % 5 === 0 ? 2 : 1;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.75)' : 'rgba(220,238,255,0.55)';
    ctx.fillRect(sx | 0, sy | 0, size, size);
  }
}

export const CHAMPIONSHIP: RegionPack = {
  id: 'championship',
  name: '강태공 분지 호수',
  base: 'home',
  zone: 'championship',
  showOthers: true,
  info: {
    shortName: '분지 호수',
    tagline: '이벤트 기간에만 열리는 겨울 산타 동산 분지 호수',
    lore: '높은 설산 능선 아래 맑은 물이 고인 분지 호수다. 겨울 축제 기간에만 산타 오두막 앞 호안이 열리며, 모든 낚시꾼이 같은 장비로 겨룬다.',
    tips: [
      '이벤트 창에서 언제든 분지 호수로 들어오고 나갈 수 있어요.',
      '표준 낚싯대가 적용되어 보유 배와 무관하게 공정하게 겨룰 수 있어요.',
      '서쪽·남쪽·동쪽 데크와 호수 둘레 호안에서 어군에 찌를 던져 보세요.',
    ],
    controls: [
      '이동: 방향키 또는 WASD',
      '낚시: 어군 옆에서 스페이스(또는 화면 누르기)',
    ],
  },
  bounds: { x: 0, y: 0, w: CHAMPIONSHIP_W, h: CHAMPIONSHIP_H },
  movement: 'walk',
  ground: { kind: 'grass', color: '#3e6f59', dot: '#2f5a47', mapColor: '#3f6e59' },
  groundDetail: drawOuterSnowRing,
  waveCount: 24,
  terrain: [
    // 백두산 천지형 다단 타원형 화구호 (외곽 빙하청 → 중간 코발트 → 심층 남청)
    { kind: 'water', rect: { x: 152, y: 108, w: 160, h: 128 }, style: 'river' },
    { kind: 'water', rect: { x: 120, y: 120, w: 224, h: 104 }, style: 'river' },
    { kind: 'water', rect: { x: 100, y: 136, w: 264, h: 72 }, style: 'river' },
    { kind: 'water', rect: { x: 164, y: 118, w: 136, h: 108 }, style: 'sea' },
    { kind: 'water', rect: { x: 136, y: 130, w: 192, h: 84 }, style: 'sea' },
    { kind: 'water', rect: { x: 116, y: 144, w: 232, h: 56 }, style: 'sea' },
    { kind: 'water', rect: { x: 180, y: 134, w: 104, h: 76 }, style: 'deep' },
    { kind: 'water', rect: { x: 156, y: 146, w: 152, h: 52 }, style: 'deep' },
    // 서쪽·남쪽·동쪽 나무 낚시 데크 3곳
    { kind: 'deck', rect: { x: 84, y: 164, w: 28, h: 16 }, style: 'pier' },
    { kind: 'deck', rect: { x: 224, y: 222, w: 16, h: 24 }, style: 'pier' },
    { kind: 'deck', rect: { x: 352, y: 164, w: 28, h: 16 }, style: 'pier' },
  ],
  buildings: [
    { rect: CHAMPIONSHIP_CABIN, sprite: 'house' },
  ],
  decorations: [
    { kind: 'xmasTree', x: 168, y: 46 },
    { kind: 'xmasTree', x: 284, y: 46 },
    { kind: 'xmasTree', x: 46, y: 232 },
    { kind: 'snowPine', x: 26, y: 26 },
    { kind: 'snowPine', x: 76, y: 34 },
    { kind: 'snowPine', x: 124, y: 28 },
    { kind: 'snowPine', x: 326, y: 28 },
    { kind: 'snowPine', x: 374, y: 34 },
    { kind: 'snowPine', x: 422, y: 26 },
    { kind: 'snowPine', x: 24, y: 112 },
    { kind: 'snowPine', x: 426, y: 112 },
    { kind: 'snowPine', x: 24, y: 184 },
    { kind: 'snowPine', x: 426, y: 184 },
    { kind: 'snowPine', x: 416, y: 234 },
    { kind: 'snowman', x: 146, y: 66 },
    { kind: 'snowman', x: 306, y: 66 },
    { kind: 'giftBox', x: 186, y: 64 },
    { kind: 'giftBox', x: 270, y: 64 },
    { kind: 'giftBox', x: 64, y: 248 },
    { kind: 'candyCane', x: 162, y: 74 },
    { kind: 'candyCane', x: 294, y: 74 },
    { kind: 'candyCane', x: 196, y: 256 },
    { kind: 'candyCane', x: 262, y: 256 },
    { kind: 'lantern', x: 190, y: 78 },
    { kind: 'lantern', x: 268, y: 78 },
    { kind: 'lantern', x: 72, y: 154 },
    { kind: 'lantern', x: 386, y: 154 },
    { kind: 'lantern', x: 210, y: 254 },
    { kind: 'lantern', x: 248, y: 254 },
  ],
  spawn: CHAMPIONSHIP_SPAWN,
  triggers: [],
  labels: [
    {
      text: '산타 오두막',
      x: CHAMPIONSHIP_CABIN.x + CHAMPIONSHIP_CABIN.w / 2,
      y: CHAMPIONSHIP_CABIN.y - 6,
      color: 'gold',
      size: 8,
    },
  ],
  flavor: (ctx, t) => {
    drawCraterRim(ctx);
    drawLakeFrostRim(ctx);
    drawSantaCabinDetail(ctx, t);
    drawSnowfall(ctx, t);
  },
};
