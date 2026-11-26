// 이벤트 전용 구역: 강태공 분지 호수 — 백두산 천지형 화구호 + 겨울·크리스마스 산타 동산 컨셉.
import type { Point, Rect, RegionPack, School } from '../types';

export const CHAMPIONSHIP_W = 448;
export const CHAMPIONSHIP_H = 360;

export const CHAMPIONSHIP_CABIN: Rect = { x: 192, y: 28, w: 64, h: 52 };
export const CHAMPIONSHIP_SPAWN: Point = { x: 224, y: 100 };

export const CHAMPIONSHIP_SCHOOLS: School[] = [
  { id: 'ch-1', spot: 'championship', x: 152, y: 140 },
  { id: 'ch-2', spot: 'championship', x: 296, y: 140 },
  { id: 'ch-3', spot: 'championship', x: 122, y: 204 },
  { id: 'ch-4', spot: 'championship', x: 326, y: 204 },
  { id: 'ch-5', spot: 'championship', x: 186, y: 264 },
  { id: 'ch-6', spot: 'championship', x: 262, y: 264 },
];

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w, h);
};

function drawCraterRim(ctx: CanvasRenderingContext2D) {
  // 외곽 현무암 화구호 능선과 눈 덮인 산등성이
  const basalt = '#4a5568';
  const darkRock = '#374151';
  const snowCap = '#edf5fc';
  for (let x = 0; x < CHAMPIONSHIP_W; x += 24) {
    const peak = 8 + ((x * 7) % 7);
    rect(ctx, x, 0, 24, peak, darkRock);
    rect(ctx, x + 2, 2, 20, Math.max(4, peak - 4), basalt);
    rect(ctx, x + 4, 0, 14, 4, snowCap);

    const southH = 8 + ((x * 5) % 6);
    rect(ctx, x, CHAMPIONSHIP_H - southH, 24, southH, darkRock);
    rect(ctx, x + 2, CHAMPIONSHIP_H - southH + 2, 20, Math.max(3, southH - 3), basalt);
    rect(ctx, x + 5, CHAMPIONSHIP_H - southH, 12, 3, snowCap);
  }
  for (let y = 16; y < CHAMPIONSHIP_H - 16; y += 22) {
    const sideW = 8 + ((y * 3) % 5);
    rect(ctx, 0, y, sideW, 22, darkRock);
    rect(ctx, 0, y + 2, sideW - 2, 18, basalt);
    rect(ctx, 2, y + 2, 3, 12, snowCap);

    rect(ctx, CHAMPIONSHIP_W - sideW, y, sideW, 22, darkRock);
    rect(ctx, CHAMPIONSHIP_W - sideW + 2, y + 2, sideW - 2, 18, basalt);
    rect(ctx, CHAMPIONSHIP_W - 5, y + 2, 3, 12, snowCap);
  }
}

function drawLakeFrostRim(ctx: CanvasRenderingContext2D) {
  // 호수 둘레 서리·살얼음 가장자리 및 데크 위 눈가루
  const frost = '#eef7ff';
  const ice = '#bae0f8';
  rect(ctx, 144, 122, 160, 2, frost);
  rect(ctx, 144, 124, 160, 2, ice);
  rect(ctx, 112, 136, 32, 2, frost);
  rect(ctx, 304, 136, 32, 2, frost);
  rect(ctx, 92, 156, 20, 2, frost);
  rect(ctx, 336, 156, 20, 2, frost);

  rect(ctx, 144, 284, 70, 2, ice);
  rect(ctx, 234, 284, 70, 2, ice);
  rect(ctx, 112, 270, 32, 2, ice);
  rect(ctx, 304, 270, 32, 2, ice);

  // 세 곳 낚시 데크 끝 눈가루 장식
  rect(ctx, 84, 196, 10, 2, frost);
  rect(ctx, 354, 196, 10, 2, frost);
  rect(ctx, 216, 288, 16, 2, frost);
}

function drawSantaCabinDetail(ctx: CanvasRenderingContext2D, t: number) {
  const r = CHAMPIONSHIP_CABIN;
  // 눈 덮인 지붕과 고드름
  rect(ctx, r.x - 5, r.y - 2, r.w + 10, 7, '#edf5fc');
  rect(ctx, r.x - 3, r.y + 5, r.w + 6, 3, '#cfe2f5');
  for (let i = 0; i < 6; i++) {
    rect(ctx, r.x + 2 + i * 11, r.y + 16, 2, 2 + (i % 2), '#d9f0fc');
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
  rect(ctx, r.x + r.w - 15, r.y - 9, 10, 2, '#edf5fc');
  for (let i = 0; i < 4; i++) {
    const phase = (t * 0.45 + i * 0.25) % 1;
    const sx = r.x + r.w - 11 + Math.sin(phase * Math.PI * 2 + i) * 3;
    const sy = r.y - 12 - phase * 18;
    const size = phase < 0.5 ? 3 : 4;
    ctx.fillStyle = `rgba(237, 245, 252, ${(1 - phase) * 0.6})`;
    ctx.fillRect(sx | 0, sy | 0, size, size);
  }
}

function drawSnowfall(ctx: CanvasRenderingContext2D, t: number) {
  for (let i = 0; i < 36; i++) {
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
  ground: { kind: 'grass', color: '#dce9f5', dot: '#bdd1e6', mapColor: '#c9dceb' },
  waveCount: 28,
  terrain: [
    // 백두산 천지형 다단 타원형 화구호 (외곽 빙하청 → 중간 코발트 → 심층 남청)
    { kind: 'water', rect: { x: 144, y: 124, w: 160, h: 160 }, style: 'river' },
    { kind: 'water', rect: { x: 112, y: 138, w: 224, h: 132 }, style: 'river' },
    { kind: 'water', rect: { x: 92, y: 158, w: 264, h: 92 }, style: 'river' },
    { kind: 'water', rect: { x: 156, y: 136, w: 136, h: 136 }, style: 'sea' },
    { kind: 'water', rect: { x: 128, y: 150, w: 192, h: 108 }, style: 'sea' },
    { kind: 'water', rect: { x: 108, y: 168, w: 232, h: 72 }, style: 'sea' },
    { kind: 'water', rect: { x: 172, y: 156, w: 104, h: 96 }, style: 'deep' },
    { kind: 'water', rect: { x: 148, y: 170, w: 152, h: 68 }, style: 'deep' },
    // 서쪽·남쪽·동쪽 나무 낚시 데크 3곳
    { kind: 'deck', rect: { x: 84, y: 196, w: 32, h: 16 }, style: 'pier' },
    { kind: 'deck', rect: { x: 216, y: 262, w: 16, h: 30 }, style: 'pier' },
    { kind: 'deck', rect: { x: 332, y: 196, w: 32, h: 16 }, style: 'pier' },
  ],
  buildings: [
    { rect: CHAMPIONSHIP_CABIN, sprite: 'house' },
  ],
  decorations: [
    { kind: 'xmasTree', x: 168, y: 56 },
    { kind: 'xmasTree', x: 272, y: 56 },
    { kind: 'xmasTree', x: 58, y: 292 },
    { kind: 'snowPine', x: 36, y: 40 },
    { kind: 'snowPine', x: 86, y: 50 },
    { kind: 'snowPine', x: 360, y: 46 },
    { kind: 'snowPine', x: 404, y: 72 },
    { kind: 'snowPine', x: 36, y: 132 },
    { kind: 'snowPine', x: 406, y: 146 },
    { kind: 'snowPine', x: 38, y: 242 },
    { kind: 'snowPine', x: 404, y: 248 },
    { kind: 'snowPine', x: 112, y: 314 },
    { kind: 'snowPine', x: 340, y: 312 },
    { kind: 'snowPine', x: 396, y: 302 },
    { kind: 'snowman', x: 144, y: 84 },
    { kind: 'snowman', x: 302, y: 94 },
    { kind: 'giftBox', x: 180, y: 74 },
    { kind: 'giftBox', x: 262, y: 74 },
    { kind: 'giftBox', x: 74, y: 304 },
    { kind: 'candyCane', x: 156, y: 92 },
    { kind: 'candyCane', x: 288, y: 92 },
    { kind: 'candyCane', x: 204, y: 298 },
    { kind: 'candyCane', x: 242, y: 298 },
    { kind: 'lantern', x: 184, y: 96 },
    { kind: 'lantern', x: 260, y: 96 },
    { kind: 'lantern', x: 76, y: 188 },
    { kind: 'lantern', x: 366, y: 188 },
    { kind: 'lantern', x: 208, y: 312 },
    { kind: 'lantern', x: 238, y: 312 },
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
