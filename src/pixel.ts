// R17, R19: 캔버스 픽셀 렌더링 — 외부 에셋 없이 코드로 그림
// 캔버스 내 텍스트/강조색은 UI 팔레트만 사용 (디자인 시스템)
import { RARITY, SPOTS } from './logic';
import type { Fish, SpotId } from './logic';
import {
  WORLD_W, WORLD_H, VIEW_W, VIEW_H,
  ZONES, HOME_ISLAND, HOUSE, DOCK, ISLANDS, SCHOOLS, FURNITURE,
} from './world';
import type { Point, Rect, School } from './world';

export const W = VIEW_W, H = VIEW_H;

// 캔버스 UI 팔레트 — index.css 토큰과 같은 값 
export const UI = {
  text: '#f2f7fb',
  dim: 'rgba(242,247,251,0.7)',
  gold: '#ffd54f',
  danger: '#ff8a80',
  shadow: 'rgba(6,12,24,0.65)',
};

type Ctx = CanvasRenderingContext2D;

export type FishingPhase = 'idle' | 'cast' | 'wait' | 'bite' | 'catch';

const ZONE_WATER: Record<SpotId, string> = {
  pond:  '#3f8cb5',
  river: '#3a7fc1',
  sea:   '#1d6396',
  deep:  '#0b2545',
};

function R(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w, h);
}

// 그림자 있는 라벨 — 캔버스 텍스트 공통 스타일
function label(ctx: Ctx, str: string, x: number, y: number, c = UI.text, size = 9) {
  ctx.font = `bold ${size}px 'Malgun Gothic', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = UI.shadow;
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = c;
  ctx.fillText(str, x, y);
}

export function drawFishSprite(ctx: Ctx, cx: number, cy: number, color: string, s: number) {
  R(ctx, cx - 5 * s, cy - 2 * s, 10 * s, 4 * s, color);
  R(ctx, cx - 4 * s, cy - 3 * s, 8 * s, 6 * s, color);
  R(ctx, cx + 5 * s, cy - 3 * s, 3 * s, 2 * s, color);
  R(ctx, cx + 5 * s, cy + 1 * s, 3 * s, 2 * s, color);
  R(ctx, cx - 3 * s, cy - 1 * s, s, s, '#000');
  R(ctx, cx - 1 * s, cy + 3 * s, 3 * s, s, 'rgba(255,255,255,0.35)');
}

function drawPerson(ctx: Ctx, x: number, y: number) {
  R(ctx, x - 3, y - 16, 6, 6, '#ffcc99');
  R(ctx, x - 4, y - 18, 8, 3, '#8d6e63');
  R(ctx, x - 2, y - 19, 4, 2, '#8d6e63');
  R(ctx, x - 3, y - 10, 6, 7, '#3f6d4e');
  R(ctx, x - 2, y - 3, 4, 3, '#31427a');
}

// 배 + 사공: (x,y) = 배 중심
function drawBoat(ctx: Ctx, x: number, y: number, t: number) {
  const rock = Math.sin(t * 2.2) * 1; // 물결에 흔들림
  R(ctx, x - 9, y - 2 + rock, 18, 5, '#8d6e63');
  R(ctx, x - 7, y + 3 + rock, 14, 2, '#6d4c41');
  R(ctx, x - 9, y - 3 + rock, 18, 1, '#a1887f');
  drawPerson(ctx, x, y - 1 + rock);
}

function drawIsland(ctx: Ctx, r: Rect, trees: boolean) {
  R(ctx, r.x - 3, r.y - 2, r.w + 6, r.h + 5, '#e9c46a');      // 모래 테두리
  R(ctx, r.x, r.y, r.w, r.h, '#74c69d');                       // 풀
  R(ctx, r.x + 2, r.y + 2, r.w - 4, 2, '#8fd6b0');             // 하이라이트
  if (trees) {
    R(ctx, r.x + 6, r.y + r.h / 2, 4, 7, '#6d4c41');
    R(ctx, r.x + 2, r.y + r.h / 2 - 9, 12, 10, '#2d6a4f');
    R(ctx, r.x + r.w - 12, r.y + r.h / 2 + 2, 3, 6, '#6d4c41');
    R(ctx, r.x + r.w - 16, r.y + r.h / 2 - 6, 11, 9, '#2d6a4f');
  }
}

// ---------- 바다 (오픈월드) ----------

export interface FieldView {
  player: Point;
  phase: FishingPhase;
  fish: Fish | null;
  school: School | null;
  level: number;
  t: number; // 초
}

export function cameraFor(p: Point): Point {
  return {
    x: Math.max(0, Math.min(p.x - VIEW_W / 2, WORLD_W - VIEW_W)),
    y: Math.max(0, Math.min(p.y - VIEW_H / 2, WORLD_H - VIEW_H)),
  };
}

export function renderField(ctx: Ctx, v: FieldView) {
  const cam = cameraFor(v.player);
  ctx.save();
  ctx.translate(-(cam.x | 0), -(cam.y | 0));

  // 해역별 바다 색
  for (const z of ZONES) R(ctx, z.x, z.y, z.w, z.h, ZONE_WATER[z.spot]);
  // 해역 경계 은은한 라인
  R(ctx, 220, 0, 1, 180, 'rgba(255,255,255,0.08)');
  R(ctx, 440, 180, 1, 180, 'rgba(255,255,255,0.08)');
  R(ctx, 0, 180, WORLD_W, 1, 'rgba(255,255,255,0.08)');

  // 물결 (이동 애니메이션)
  for (let i = 0; i < 70; i++) {
    const wx = (i * 89 + Math.sin(v.t * 0.8 + i) * 8 + WORLD_W) % WORLD_W;
    const wy = (i * 53) % WORLD_H;
    R(ctx, wx, wy, 7, 1, 'rgba(255,255,255,0.16)');
  }
  // 심해 반짝임
  for (let i = 0; i < 12; i++) {
    const sx = 450 + (i * 37) % 180, sy = 190 + (i * 61) % 160;
    if ((Math.sin(v.t * 2 + i) + 1) / 2 > 0.6) R(ctx, sx, sy, 1, 1, 'rgba(140,190,255,0.5)');
  }

  // 장애물 섬
  ISLANDS.forEach((isl, i) => drawIsland(ctx, isl, i % 2 === 0));

  // 집 섬 + 집 + 선착장
  drawIsland(ctx, HOME_ISLAND, false);
  R(ctx, HOUSE.x, HOUSE.y + 10, HOUSE.w, HOUSE.h - 10, '#a1887f');       // 벽
  R(ctx, HOUSE.x - 3, HOUSE.y, HOUSE.w + 6, 12, '#b71c1c');              // 지붕
  R(ctx, HOUSE.x + HOUSE.w / 2 - 6, HOUSE.y + 18, 12, 16, '#4e342e');    // 문
  R(ctx, HOUSE.x + 6, HOUSE.y + 16, 9, 9, '#a5d8ff');                    // 창
  R(ctx, DOCK.x + 4, HOME_ISLAND.y + HOME_ISLAND.h - 2, DOCK.w - 8, DOCK.h + 4, '#8d6e63'); // 선착장 판자
  for (let y = 0; y < DOCK.h; y += 5) R(ctx, DOCK.x + 4, HOME_ISLAND.y + HOME_ISLAND.h + y, DOCK.w - 8, 1, '#795548');
  label(ctx, '집', HOUSE.x + HOUSE.w / 2, HOUSE.y - 4, UI.text, 8);

  // 군집: 물고기 그림자 + 잠금 표시 (R4b, R5b)
  for (const s of SCHOOLS) {
    const req = SPOTS.find(sp => sp.id === s.spot)!;
    const locked = v.level < req.unlockLevel;
    R(ctx, s.x - 12, s.y - 8, 24, 16, 'rgba(255,255,255,0.05)'); // 군집 영역 힌트
    for (let i = 0; i < 3; i++) {
      const a = v.t * 1.6 + i * 2.09;
      const fx = s.x + Math.cos(a) * 7, fy = s.y + Math.sin(a) * 5;
      const c = locked ? 'rgba(0,0,0,0.3)' : 'rgba(8,25,38,0.55)';
      R(ctx, fx - 3, fy - 1, 6, 2, c);
      R(ctx, fx + 3, fy - 2, 2, 4, c);
    }
    if (locked) label(ctx, `Lv.${req.unlockLevel}`, s.x, s.y - 11, UI.danger, 8);
  }

  // 낚싯줄 + 찌
  if (v.phase !== 'idle' && v.school) {
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

  drawBoat(ctx, v.player.x, v.player.y, v.t);
  ctx.restore();

  // R17: 획득 카드 (뷰포트 고정)
  if (v.phase === 'catch' && v.fish) {
    const f = v.fish;
    const r = RARITY[f.rarity];
    R(ctx, 60, 40, 200, 70, UI.shadow);
    R(ctx, 60, 40, 200, 3, r.color); R(ctx, 60, 107, 200, 3, r.color);
    const scale = { common: 2, rare: 2, epic: 3, legendary: 3 }[f.rarity];
    drawFishSprite(ctx, 160, 68, f.color, scale);
    label(ctx, f.name, 160, 96, UI.text, 12);
    label(ctx, r.name, 160, 54, r.color, 10);
    if (f.rarity === 'legendary') {
      for (let i = 0; i < 10; i++) {
        const a = v.t * 3 + i;
        R(ctx, 160 + Math.cos(a) * (40 + i * 3), 70 + Math.sin(a) * 25, 2, 2, UI.gold);
      }
    }
  }
}

// ---------- 집 내부 (정적 상호작용) ----------

export function renderHome(ctx: Ctx, rod: number, dexCount: number, dexTotal: number) {
  R(ctx, 0, 0, W, H, '#6d4c41');
  R(ctx, 0, 124, W, 56, '#8d6e63');
  for (let i = 0; i < W; i += 32) R(ctx, i, 124, 1, 56, '#795548');

  // 창문 — 바다가 보임
  R(ctx, 96, 34, 44, 34, '#3f8cb5');
  R(ctx, 98, 52, 40, 2, 'rgba(255,255,255,0.3)');
  R(ctx, 94, 32, 48, 3, '#4e342e'); R(ctx, 94, 67, 48, 3, '#4e342e');
  R(ctx, 94, 32, 3, 38, '#4e342e'); R(ctx, 139, 32, 3, 38, '#4e342e');

  for (const f of FURNITURE) {
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
        label(ctx, `작업대 · 강화 Lv.${rod}`, f.x + f.w / 2, f.y - 10, UI.gold, 8);
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
        label(ctx, '문 · 출항', f.x + f.w / 2, f.y - 4, UI.gold, 8);
        break;
    }
  }

  drawPerson(ctx, 170, 160);
  label(ctx, '나의 집 — 가구를 클릭해 정비하자', W / 2, 18, UI.text, 10);
}
