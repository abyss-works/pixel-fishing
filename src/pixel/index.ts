// R17, R19: 캔버스 픽셀 렌더링 — 외부 에셋 없이 코드로 그림
// 캔버스 내 텍스트/강조색은 UI 팔레트만 사용 (디자인 시스템)
// 어종별 스프라이트 모양은 sprites.ts로 분리 — 이 파일은 씬(마을/대양/거점/월드맵) 담당.
import { SPOTS } from '../logic';
import {
  VIEW_W, VIEW_H,
  VILLAGE_W, VILLAGE_H, V_POND, V_RIVER, V_SEA, V_HOUSE, V_BRIDGE, V_PIER, V_BOATSHOP, V_SCHOOLS,
  OCEAN_W, OCEAN_H, LANDS, TRENCH, HARBOR, O_DOCK, O_SCHOOLS,
  HOME_FURNITURE, HARBOR_FURNITURE,
} from '../world';
import type { Point, Rect, School } from '../world';
import { R, label, UI } from './common.js';
import type { Ctx } from './common.js';
import { drawFishSprite } from './sprites.js';
export { UI } from './common.js';
export { drawFishSprite } from './sprites.js';
export type { FishShape } from './sprites.js';

export const W = VIEW_W, H = VIEW_H;

// 내부 해상도 배율 — 도트(사각형)는 정수 스케일로 유지되고 텍스트만 선명해진다
export const SCALE = 2;
export const CANVAS_W = W * SCALE, CANVAS_H = H * SCALE;

export type { FishingPhase } from '../fishing';
import type { FishingPhase } from '../fishing';

// 획득 카드/등급 이펙트는 전부 DOM(CatchCard.tsx)으로 이동 — 캔버스는 필드 연출만 담당.
// (카드가 캔버스 중앙을 덮으므로 캔버스에 그린 파티클은 보이지 않았다)
export interface FieldView {
  player: Point;
  phase: FishingPhase;
  school: School | null;
  boat: number;
  biteT: number | null;
  zone: number;
  t: number;
}

function drawPerson(ctx: Ctx, x: number, y: number) {
  R(ctx, x - 3, y - 16, 6, 6, '#ffcc99');
  R(ctx, x - 4, y - 18, 8, 3, '#8d6e63');
  R(ctx, x - 2, y - 19, 4, 2, '#8d6e63');
  R(ctx, x - 3, y - 10, 6, 7, '#3f6d4e');
  R(ctx, x - 2, y - 3, 4, 3, '#31427a');
}

function drawBoat(ctx: Ctx, x: number, y: number, t: number) {
  const rock = Math.sin(t * 2.2) * 1;
  R(ctx, x - 9, y - 2 + rock, 18, 5, '#8d6e63');
  R(ctx, x - 7, y + 3 + rock, 14, 2, '#6d4c41');
  R(ctx, x - 9, y - 3 + rock, 18, 1, '#a1887f');
  drawPerson(ctx, x, y - 1 + rock);
}

function drawLand(ctx: Ctx, r: Rect) {
  R(ctx, r.x - 3, r.y - 2, r.w + 6, r.h + 5, '#e9c46a');
  R(ctx, r.x, r.y, r.w, r.h, '#74c69d');
  R(ctx, r.x + 2, r.y + 2, Math.max(r.w - 4, 2), 2, '#8fd6b0');
  if (r.w >= 60 && r.h >= 40) {
    for (let i = 0; i < Math.floor((r.w * r.h) / 3000); i++) {
      const tx = r.x + 8 + (i * 53) % Math.max(r.w - 20, 1);
      const ty = r.y + 8 + (i * 37) % Math.max(r.h - 20, 1);
      R(ctx, tx, ty, 8, 7, '#2d6a4f');
      R(ctx, tx + 3, ty + 7, 3, 4, '#6d4c41');
    }
  }
}

// ---------- 공통: 군집/낚시 연출 ----------

function drawSchools(ctx: Ctx, schools: School[], boat: number, t: number, lockLabel = true) {
  for (const s of schools) {
    const req = SPOTS.find(sp => sp.id === s.spot)!;
    const locked = boat < req.boatTier;
    R(ctx, s.x - 12, s.y - 8, 24, 16, 'rgba(255,255,255,0.05)');
    for (let i = 0; i < 3; i++) {
      const a = t * 1.6 + i * 2.09;
      const fx = s.x + Math.cos(a) * 7, fy = s.y + Math.sin(a) * 5;
      const c = locked ? 'rgba(0,0,0,0.3)' : 'rgba(8,25,38,0.55)';
      R(ctx, fx - 3, fy - 1, 6, 2, c);
      R(ctx, fx + 3, fy - 2, 2, 4, c);
    }
    if (locked && lockLabel) label(ctx, `배 ${req.boatTier}단계`, s.x, s.y - 11, UI.danger, 8);
  }
}

function drawFishingGear(ctx: Ctx, v: FieldView) {
  if (v.phase === 'idle' || !v.school) return;
  const bob = v.phase === 'bite' ? Math.sin(v.t * 30) * 2 : Math.sin(v.t * 2);
  const bx = v.school.x, by = v.school.y + bob;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(v.player.x, v.player.y - 14);
  ctx.lineTo(bx, by - 2);
  ctx.stroke();
  R(ctx, bx - 2, by - 2, 4, 4, '#e53935');
  R(ctx, bx - 2, by - 4, 4, 2, '#fff');
  if (v.phase === 'bite') label(ctx, '!', bx, by - 10, UI.gold, 22);
}

// 타이밍 바 — 중앙 존 명중 = PERFECT (R6b)
function drawTimingBar(ctx: Ctx, v: FieldView) {
  if (v.phase !== 'bite' || v.biteT === null) return;
  const bw = 44, bh = 5;
  const bx = v.player.x - bw / 2, by = v.player.y - 30;
  R(ctx, bx - 1, by - 1, bw + 2, bh + 2, UI.shadow);
  R(ctx, bx, by, bw, bh, '#26364f');
  const zw = bw * v.zone;
  R(ctx, bx + (bw - zw) / 2, by, zw, bh, 'rgba(255,213,79,0.85)');
  const cx = bx + Math.min(v.biteT, 1) * bw;
  R(ctx, cx - 1, by - 2, 2, bh + 4, '#fff');
}

export function cameraFor(p: Point, worldW: number, worldH: number): Point {
  return {
    x: Math.max(0, Math.min(p.x - VIEW_W / 2, worldW - VIEW_W)),
    y: Math.max(0, Math.min(p.y - VIEW_H / 2, worldH - VIEW_H)),
  };
}

// ---------- 지역 1: 마을 필드 ----------

export function renderVillageField(ctx: Ctx, v: FieldView) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const cam = cameraFor(v.player, VILLAGE_W, VILLAGE_H);
  ctx.save();
  ctx.translate(-(cam.x | 0), -(cam.y | 0));

  R(ctx, 0, 0, VILLAGE_W, VILLAGE_H, '#74c69d'); // 초지
  for (let i = 0; i < 80; i++) R(ctx, (i * 97) % VILLAGE_W, (i * 61) % VILLAGE_H, 2, 2, '#5fb389');

  // 물: 연못 / 강 / 남쪽 바다
  R(ctx, V_POND.x - 3, V_POND.y - 2, V_POND.w + 6, V_POND.h + 5, '#e9c46a');
  R(ctx, V_POND.x, V_POND.y, V_POND.w, V_POND.h, '#3f8cb5');
  R(ctx, V_RIVER.x, V_RIVER.y, V_RIVER.w, V_RIVER.h, '#3a7fc1');
  R(ctx, V_RIVER.x, V_RIVER.y, V_RIVER.w, 2, '#6ba3e5');
  R(ctx, V_SEA.x, V_SEA.y, V_SEA.w, V_SEA.h, '#1d6396');
  R(ctx, V_SEA.x, V_SEA.y, V_SEA.w, 2, '#2a91c9');
  for (let i = 0; i < 30; i++) {
    const wx = (i * 83 + Math.sin(v.t + i) * 6 + VILLAGE_W) % VILLAGE_W;
    const wy = [V_POND, V_RIVER, V_SEA][i % 3];
    R(ctx, Math.max(wy.x, Math.min(wx, wy.x + wy.w - 8)), wy.y + 6 + (i * 7) % Math.max(wy.h - 10, 1), 8, 1, 'rgba(255,255,255,0.25)');
  }

  // 다리 + 포구 부두
  R(ctx, V_BRIDGE.x, V_BRIDGE.y, V_BRIDGE.w, V_BRIDGE.h, '#8d6e63');
  for (let y = V_BRIDGE.y; y < V_BRIDGE.y + V_BRIDGE.h; y += 7) R(ctx, V_BRIDGE.x, y, V_BRIDGE.w, 1, '#795548');
  R(ctx, V_PIER.x, V_PIER.y, V_PIER.w, V_PIER.h, '#8d6e63');
  for (let y = V_PIER.y; y < V_PIER.y + V_PIER.h; y += 6) R(ctx, V_PIER.x, y, V_PIER.w, 1, '#795548');
  label(ctx, '⚓ 포구 — 대양으로', V_PIER.x + 8, V_PIER.y - 4, UI.gold, 8);

  // 목공소 — 포구 오른쪽, 배를 사는 곳 (서쪽 문 앞이 트리거)
  R(ctx, V_BOATSHOP.x, V_BOATSHOP.y + 8, V_BOATSHOP.w, V_BOATSHOP.h - 8, '#8d6e63');
  R(ctx, V_BOATSHOP.x - 3, V_BOATSHOP.y, V_BOATSHOP.w + 6, 12, '#546e7a');        // 지붕
  R(ctx, V_BOATSHOP.x + 2, V_BOATSHOP.y + 16, 10, 16, '#4e342e');                 // 서쪽 문(포구 쪽)
  R(ctx, V_BOATSHOP.x + V_BOATSHOP.w - 18, V_BOATSHOP.y + 16, 12, 8, '#a5d8ff');  // 창
  // 작업 중인 배 골격
  R(ctx, V_BOATSHOP.x + 8, V_BOATSHOP.y + V_BOATSHOP.h - 8, V_BOATSHOP.w - 24, 4, '#a1887f');
  label(ctx, '🔨 목공소 — 배 만드는 곳', V_BOATSHOP.x + V_BOATSHOP.w / 2, V_BOATSHOP.y - 4, UI.gold, 8);

  // 집 외관
  R(ctx, V_HOUSE.x, V_HOUSE.y + 14, V_HOUSE.w, V_HOUSE.h - 14, '#a1887f');
  R(ctx, V_HOUSE.x - 4, V_HOUSE.y, V_HOUSE.w + 8, 16, '#b71c1c');
  R(ctx, V_HOUSE.x + 24, V_HOUSE.y + 34, 16, 32, '#4e342e');
  R(ctx, V_HOUSE.x + 8, V_HOUSE.y + 24, 12, 12, '#a5d8ff');
  label(ctx, '집', V_HOUSE.x + V_HOUSE.w / 2, V_HOUSE.y - 4, UI.text, 8);

  // 나무
  for (const [tx, ty] of [[260, 60], [420, 90], [560, 50], [80, 270], [600, 270], [450, 160]]) {
    R(ctx, tx + 3, ty + 10, 4, 8, '#6d4c41');
    R(ctx, tx - 2, ty, 14, 12, '#2d6a4f');
  }

  drawSchools(ctx, V_SCHOOLS, v.boat, v.t);
  drawFishingGear(ctx, v);
  drawPerson(ctx, v.player.x, v.player.y);
  drawTimingBar(ctx, v);
  ctx.restore();
}

// ---------- 지역 2: 대양 필드 (단순화한 지구) ----------

const OCEAN_LABELS: { name: string; x: number; y: number }[] = [
  { name: '태평양', x: 700, y: 120 },
  { name: '마리아나 해구', x: 555, y: 345 },
];

export function renderOceanField(ctx: Ctx, v: FieldView) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const cam = cameraFor(v.player, OCEAN_W, OCEAN_H);
  ctx.save();
  ctx.translate(-(cam.x | 0), -(cam.y | 0));

  R(ctx, 0, 0, OCEAN_W, OCEAN_H, '#1d6396');                 // 태평양
  R(ctx, TRENCH.x, TRENCH.y, TRENCH.w, TRENCH.h, '#0b2545'); // 마리아나 해구
  R(ctx, TRENCH.x, TRENCH.y, TRENCH.w, 1, 'rgba(255,255,255,0.08)');

  for (let i = 0; i < 110; i++) {
    const wx = (i * 89 + Math.sin(v.t * 0.8 + i) * 8 + OCEAN_W) % OCEAN_W;
    const wy = (i * 53) % OCEAN_H;
    R(ctx, wx, wy, 7, 1, 'rgba(255,255,255,0.16)');
  }
  for (let i = 0; i < 14; i++) { // 해구 반짝임
    const sx = TRENCH.x + (i * 37) % TRENCH.w, sy = TRENCH.y + (i * 61) % TRENCH.h;
    if ((Math.sin(v.t * 2 + i) + 1) / 2 > 0.6) R(ctx, sx, sy, 1, 1, 'rgba(140,190,255,0.5)');
  }

  for (const l of LANDS) drawLand(ctx, l);
  for (const z of OCEAN_LABELS) label(ctx, z.name, z.x, z.y, 'rgba(242,247,251,0.45)', 9);

  // 항구 (한반도 남단)
  R(ctx, HARBOR.x + 2, HARBOR.y + 10, 18, 14, '#a1887f');
  R(ctx, HARBOR.x, HARBOR.y + 6, 22, 6, '#b71c1c');
  R(ctx, HARBOR.x + 26, HARBOR.y + 2, 3, 22, '#546e7a');
  R(ctx, HARBOR.x + 26, HARBOR.y + 2, 12, 2, '#546e7a');
  R(ctx, O_DOCK.x + 2, HARBOR.y + HARBOR.h, O_DOCK.w - 4, 16, '#8d6e63');
  for (let y = 0; y < 14; y += 5) R(ctx, O_DOCK.x + 2, HARBOR.y + HARBOR.h + y, O_DOCK.w - 4, 1, '#795548');
  label(ctx, '⚓ 항구', HARBOR.x + HARBOR.w / 2, HARBOR.y + 2, UI.gold, 8);

  drawSchools(ctx, O_SCHOOLS, v.boat, v.t);
  drawFishingGear(ctx, v);
  drawBoat(ctx, v.player.x, v.player.y, v.t);
  drawTimingBar(ctx, v);
  ctx.restore();
}

// ---------- 월드맵 (M 키 모달, 월드 1:1 해상도) ----------

const VILLAGE_LABELS: { name: string; x: number; y: number }[] = [
  { name: '마을 연못', x: 155, y: 85 },
  { name: '마을 강', x: 480, y: 195 },
  { name: '남쪽 바다 — 포구에서 대양으로', x: 320, y: 305 },
];

// labels=false + t 전달 시 사이드바 미니맵 모드 (지명·범례 생략, 내 위치 점멸)
export function renderWorldMap(
  ctx: Ctx, region: 'village' | 'ocean', player: Point, boat: number,
  opts: { labels?: boolean; t?: number } = {},
) {
  const labels = opts.labels ?? true;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (region === 'village') {
    R(ctx, 0, 0, VILLAGE_W, VILLAGE_H, '#4c7c5e');
    R(ctx, V_POND.x, V_POND.y, V_POND.w, V_POND.h, '#3f8cb5');
    R(ctx, V_RIVER.x, V_RIVER.y, V_RIVER.w, V_RIVER.h, '#3a7fc1');
    R(ctx, V_SEA.x, V_SEA.y, V_SEA.w, V_SEA.h, '#1d6396');
    R(ctx, V_BRIDGE.x, V_BRIDGE.y, V_BRIDGE.w, V_BRIDGE.h, '#8d6e63');
    R(ctx, V_PIER.x, V_PIER.y, V_PIER.w, V_PIER.h, '#8d6e63');
    R(ctx, V_HOUSE.x, V_HOUSE.y, V_HOUSE.w, V_HOUSE.h, '#a1887f');
    R(ctx, V_BOATSHOP.x, V_BOATSHOP.y, V_BOATSHOP.w, V_BOATSHOP.h, '#546e7a');
    if (labels) {
      label(ctx, '⌂ 집', V_HOUSE.x + V_HOUSE.w / 2, V_HOUSE.y - 6, UI.gold, 12);
      for (const z of VILLAGE_LABELS) label(ctx, z.name, z.x, z.y, 'rgba(242,247,251,0.6)', 12);
    }
    drawSchools(ctx, V_SCHOOLS, boat, opts.t ?? 0, labels);
  } else {
    R(ctx, 0, 0, OCEAN_W, OCEAN_H, '#1d6396');
    R(ctx, TRENCH.x, TRENCH.y, TRENCH.w, TRENCH.h, '#0b2545');
    for (const l of LANDS) drawLand(ctx, l);
    if (labels) {
      for (const z of OCEAN_LABELS) label(ctx, z.name, z.x, z.y, 'rgba(242,247,251,0.6)', 13);
      label(ctx, '⚓ 항구', HARBOR.x + HARBOR.w / 2, HARBOR.y - 6, UI.gold, 12);
    }
    drawSchools(ctx, O_SCHOOLS, boat, opts.t ?? 0, labels);
  }
  if (labels) {
    // 내 위치 — 십자 마커
    R(ctx, player.x - 3, player.y - 3, 6, 6, '#ffffff');
    R(ctx, player.x - 6, player.y - 6, 12, 1, 'rgba(255,255,255,0.6)');
    R(ctx, player.x - 6, player.y + 5, 12, 1, 'rgba(255,255,255,0.6)');
    R(ctx, player.x - 6, player.y - 6, 1, 12, 'rgba(255,255,255,0.6)');
    R(ctx, player.x + 5, player.y - 6, 1, 12, 'rgba(255,255,255,0.6)');
    label(ctx, '내 위치', player.x, player.y - 10, UI.text, 11);
  } else {
    // 미니맵 모드 — 점멸 점
    const blink = (Math.sin((opts.t ?? 0) * 6) + 1) / 2 > 0.35;
    if (blink) R(ctx, player.x - 6, player.y - 6, 12, 12, '#ffffff');
  }
}

// ---------- 거점: 집 실내 (마을) ----------

// _boatName: renderHarbor와 시그니처 공유(호출부가 삼항으로 고름) — 집엔 목공소가 없어 안 쓴다
export function renderHome(ctx: Ctx, rod: number, _boatName: string, dexCount: number, dexTotal: number) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  R(ctx, 0, 0, W, H, '#6d4c41');                 // 벽
  R(ctx, 0, 124, W, 56, '#8d6e63');              // 바닥
  for (let i = 0; i < W; i += 32) R(ctx, i, 124, 1, 56, '#795548');
  R(ctx, 96, 34, 44, 34, '#a5d8ff');             // 창 — 마을 풍경
  R(ctx, 98, 56, 40, 10, '#74c69d');
  R(ctx, 94, 32, 48, 3, '#4e342e'); R(ctx, 94, 67, 48, 3, '#4e342e');
  R(ctx, 94, 32, 3, 38, '#4e342e'); R(ctx, 139, 32, 3, 38, '#4e342e');

  for (const f of HOME_FURNITURE) {
    switch (f.id) {
      case 'dex':
        R(ctx, f.x, f.y, f.w, f.h, '#4e342e');
        for (let row = 0; row < 3; row++) {
          for (let i = 0; i < 5; i++) {
            R(ctx, f.x + 4 + i * 7, f.y + 6 + row * 18, 5, 12,
              ['#e57373', '#4fc3f7', '#ffd54f', '#81c784', '#ba68c8'][(i + row) % 5]);
          }
        }
        label(ctx, `책장 · 도감 ${dexCount}/${dexTotal}`, f.x + f.w / 2, f.y - 4, UI.gold, 8);
        break;
      case 'rod':
        R(ctx, f.x, f.y + 14, f.w, 8, '#4e342e');
        R(ctx, f.x + 4, f.y + 22, 5, 12, '#4e342e');
        R(ctx, f.x + f.w - 9, f.y + 22, 5, 12, '#4e342e');
        R(ctx, f.x + 8, f.y - 6, 2, 22, '#8d6e63');
        R(ctx, f.x + 10, f.y - 6, 16, 1, '#ccc');
        label(ctx, `작업대 · 낚싯대 Lv.${rod}`, f.x + f.w / 2, f.y - 10, UI.gold, 8);
        break;
      case 'sell':
        R(ctx, f.x, f.y + 6, f.w, f.h - 6, '#8d6e63');
        R(ctx, f.x, f.y, f.w, 8, '#a1887f');
        R(ctx, f.x + f.w / 2 - 3, f.y + 8, 6, 8, '#ffd54f');
        label(ctx, '판매 궤짝', f.x + f.w / 2, f.y - 4, UI.gold, 8);
        break;
      case 'exit':
        R(ctx, f.x, f.y, f.w, f.h, '#4e342e');
        R(ctx, f.x + 3, f.y + 3, f.w - 6, f.h - 6, '#5d4037');
        R(ctx, f.x + f.w - 9, f.y + f.h / 2 - 2, 4, 4, '#ffd54f');
        label(ctx, '문 · 마을로', f.x + f.w / 2, f.y - 4, UI.gold, 8);
        break;
    }
  }

  // 사람은 그리지 않는다 — 거점은 "들어와서 둘러보는 중" 1인칭 시점
  label(ctx, '🏠 나의 집 — 가구를 클릭해 정비하자', W / 2, 14, UI.text, 10);
}

// ---------- 거점: 항구 (대양) ----------

export function renderHarbor(ctx: Ctx, rod: number, boatName: string, dexCount: number, dexTotal: number) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  R(ctx, 0, 0, W, 96, '#8ecae6');
  R(ctx, 40, 26, 26, 4, '#fff'); R(ctx, 210, 16, 32, 4, '#fff');
  R(ctx, 0, 96, W, 28, '#3f8cb5');
  R(ctx, 0, 96, W, 1, 'rgba(255,255,255,0.5)');
  for (let i = 0; i < 8; i++) R(ctx, 10 + i * 40, 104 + (i % 3) * 5, 12, 1, 'rgba(255,255,255,0.35)');
  R(ctx, 0, 124, W, 56, '#8d6e63');
  for (let i = 0; i < W; i += 26) R(ctx, i, 124, 1, 56, '#795548');
  R(ctx, 0, 124, W, 2, '#a1887f');

  for (const f of HARBOR_FURNITURE) {
    switch (f.id) {
      case 'dex':
        R(ctx, f.x, f.y + 10, f.w, f.h - 10, '#a1887f');
        R(ctx, f.x - 3, f.y, f.w + 6, 12, '#37474f');
        R(ctx, f.x + 6, f.y + 22, 12, 14, '#4e342e');
        R(ctx, f.x + 24, f.y + 20, 11, 10, '#a5d8ff');
        R(ctx, f.x + 4, f.y + 42, f.w - 8, 12, '#4e342e');
        R(ctx, f.x + 6, f.y + 44, f.w - 12, 8, '#ffe0b2');
        label(ctx, `사무소 · 도감 ${dexCount}/${dexTotal}`, f.x + f.w / 2, f.y - 4, UI.gold, 8);
        break;
      case 'rod':
        R(ctx, f.x, f.y + 14, f.w, 8, '#4e342e');
        R(ctx, f.x + 4, f.y + 22, 5, 12, '#4e342e');
        R(ctx, f.x + f.w - 9, f.y + 22, 5, 12, '#4e342e');
        R(ctx, f.x, f.y - 2, f.w, 6, '#b71c1c');
        for (let i = 0; i < 3; i++) {
          R(ctx, f.x + 10 + i * 12, f.y + 2, 2, 14, '#8d6e63');
          R(ctx, f.x + 12 + i * 12, f.y + 2, 7, 1, '#ccc');
        }
        label(ctx, `공방 · 낚싯대 Lv.${rod}`, f.x + f.w / 2, f.y - 8, UI.gold, 8);
        break;
      case 'sell':
        R(ctx, f.x, f.y + 8, f.w, f.h - 8, '#8d6e63');
        R(ctx, f.x, f.y - 2, f.w, 6, '#1d6396');
        R(ctx, f.x + 3, f.y + 10, f.w - 6, 10, '#e3f2fd');
        drawFishSprite(ctx, f.x + 12, f.y + 15, 'slim', '#42a5f5', 1);
        drawFishSprite(ctx, f.x + 30, f.y + 15, 'round', '#e57373', 1);
        label(ctx, '어시장', f.x + f.w / 2, f.y - 8, UI.gold, 8);
        break;
      case 'boat':
        R(ctx, f.x, f.y + f.h - 6, f.w, 6, '#546e7a');
        R(ctx, f.x + 8, f.y + 12, f.w - 16, 7, '#8d6e63');
        R(ctx, f.x + f.w / 2 - 1, f.y + 2, 2, 10, '#6d4c41');
        R(ctx, f.x + f.w / 2 + 1, f.y + 3, 9, 7, '#e0e0e0');
        label(ctx, `조선소 · ${boatName}`, f.x + f.w / 2, f.y - 3, UI.gold, 8);
        break;
      case 'exit':
        R(ctx, f.x + 2, f.y + 30, f.w - 4, 10, '#8d6e63');
        R(ctx, f.x + 4, f.y + 40, f.w - 8, 3, '#6d4c41');
        R(ctx, f.x + f.w / 2 - 1, f.y + 14, 2, 16, '#6d4c41');
        R(ctx, f.x + f.w / 2 + 1, f.y + 15, 10, 9, '#e0e0e0');
        R(ctx, f.x - 4, f.y + f.h - 8, 14, 3, '#a1887f');
        label(ctx, '승선 · 출항', f.x + f.w / 2, f.y + 8, UI.gold, 8);
        break;
      case 'travel':
        R(ctx, f.x + 2, f.y + 14, f.w - 4, 12, '#e0e0e0');       // 여객선 선체
        R(ctx, f.x + 6, f.y + 8, f.w - 20, 7, '#90a4ae');        // 선실
        R(ctx, f.x + 8, f.y + 26, f.w - 12, 3, '#37474f');
        R(ctx, f.x + f.w - 14, f.y + 4, 4, 10, '#b71c1c');       // 굴뚝
        label(ctx, '여객선 · 마을로', f.x + f.w / 2, f.y - 2, UI.gold, 8);
        break;
    }
  }

  // 사람은 그리지 않는다 — 거점은 "들어와서 둘러보는 중" 1인칭 시점
  label(ctx, '⚓ 항구 — 시설을 클릭해 정비하자', W / 2, 14, UI.text, 10);
}
