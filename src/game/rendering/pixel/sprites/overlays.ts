// 게임 상태 오버레이 스프라이트 — 어군/낚싯줄·찌/타이밍 바처럼 "상태를 월드 좌표에 그리는" 것들.
// 상태는 파라미터(FieldView 조각)로만 받는다 — React/게임 규칙 직접 의존 금지 (계층: 단위 스프라이트)
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { spotById } from '../../../content/spots';
import type { School } from '../../../world/types';
import { FISH } from '../../../content/fish';
import type { FormId } from '../../../content/fish';
import { eventFishById } from '../../../content/eventFish';
import { RARITY } from '../../../content/rarity';
import type { RarityId } from '../../../content/rarity';
import { DEFAULT_FISH_ART_STYLE, fishArt } from '../fishArt/index.js';
import type { FishArtStyle } from '../fishArt/index.js';
import { JUMP_S, jumpHeight, orbit } from './schoolView.js';

const fishById = (id: string) => FISH.find(f => f.id === id) ?? eventFishById(id);

const JUMP_FISH_SCALE = 1;
const TAKEOFF_SPLASH_S = 0.25;
const LANDING_SPLASH_S = 0.22;
const MIN_JUMP_TRAVEL_PX = 4;
const TRAIL_STEP_S = 0.055;
const TRAIL_COUNT = 5;

export interface JumpFx {
  x: number;
  y: number;
  toX?: number;
  toY?: number;
  fishId: string;
  form?: FormId;
  /** 점프 시작 후 경과 초(0 이상 ~ JUMP_S 미만) */
  t: number;
  /** 효과 강도. 작게는 꼬리 스파크 없이 물고기만 그린다 */
  intensity: 'small' | 'large' | 'largest';
  /** 동작 축소. 켜지면 이동, 물보라, 꼬리 반짝이를 그리지 않는다 */
  reducedMotion?: boolean;
}

/** 챔질 판정 글자. t는 판정 뒤 경과 초 */
export interface JudgmentFx {
  grade: 'perfect' | 'good';
  t: number;
}

export interface GearView {
  player: { x: number; y: number };
  school: School | null;
  phase: string;
  biteT: number | null;
  zone: number;
  /** 빨간 존(PERFECT) 폭 — 파워 게이트 초과 보너스. 없으면 그리지 않는다 */
  red?: number;
  /** 빨간 존 중심의 바 비율(0~1). 없으면 중앙 */
  redCenter?: number;
  t: number;
  /** 물고기 그래픽 스타일 */
  fishArt?: FishArtStyle;
  /** 동작 축소. 켜지면 찌 흔들림을 멈춘다 */
  reducedMotion?: boolean;
}

/** zoom = 마커 크기 보정(1 기본). 미니맵처럼 pack 좌표를 축소 그리는 캔버스에서 지도가 커지면
 *  마커가 화면에서 쪼그라들므로, renderWorldMap이 1/s를 넣어 **표시 크기를 일정하게** 유지한다.
 *  어군은 어종과 무관한 검은 점 마커다(어종 스프라이트는 쓰지 않는다). view가 있으면
 *  입질 중인 어군만 찌 쪽으로 좁게 몬다. */
export function drawSchools(ctx: Ctx, schools: School[], boat: number, t: number,
                            lockLabel = true, zoom = 1, view?: GearView) {
  for (const s of schools) {
    const req = spotById(s.spot);
    const locked = req ? boat < req.boatTier : false;
    R(ctx, s.x - 12 * zoom, s.y - 8 * zoom, 24 * zoom, 16 * zoom, 'rgba(255,255,255,0.05)');
    const bite = view?.school?.id === s.id && view.phase === 'bite';
    for (let i = 0; i < 3; i++) {
      const o = orbit(i, t, bite);
      const fx = s.x + o.dx * zoom, fy = s.y + o.dy * zoom;
      const c = locked ? 'rgba(0,0,0,0.3)' : 'rgba(8,25,38,0.55)';
      R(ctx, fx - 3 * zoom, fy - 1 * zoom, 6 * zoom, 2 * zoom, c);
      R(ctx, fx + 3 * zoom, fy - 2 * zoom, 2 * zoom, 4 * zoom, c);
    }
    if (req && locked && lockLabel) label(ctx, `배 ${req.boatTier}단계`, s.x, s.y - 11, UI.danger, 8);
  }
}

function drawWaterSplash(ctx: Ctx, x: number, y: number, p: number, landing: boolean) {
  const arc = Math.sin(p * Math.PI);
  const rippleW = Math.round((landing ? 10 : 6) + p * (landing ? 14 : 10));
  R(ctx, x - rippleW / 2, y, rippleW, 1, '#b2ebf2');
  if (landing) {
    R(ctx, x - rippleW / 2 + 2, y + 2, Math.max(4, rippleW - 4), 1, 'rgba(178,235,242,0.65)');
  }
  const outerSpread = landing ? 4 + p * 13 : 3 + p * 10;
  const outerHeight = arc * (landing ? 8 : 7);
  const innerSpread = landing ? 2 + p * 7 : 1 + p * 5;
  const innerHeight = arc * (landing ? 12 : 11);
  for (const sign of [-1, 1] as const) {
    R(ctx, x + sign * outerSpread, y - outerHeight, 2, 2, '#e0f7fa');
    R(ctx, x + sign * innerSpread, y - innerHeight, landing ? 2 : 1, landing ? 1 : 2, '#80deea');
  }
  if (!landing) {
    R(ctx, x + (p < 0.5 ? -1 : 1), y - arc * 9, 1, 1, '#e0f7fa');
  }
}

/** 점프 시각 t에서의 포물선 좌표 — 목표가 있으면 선형 보간 위에 점프 높이를 더한다 */
export function jumpPoint(
  jump: Pick<JumpFx, 'x' | 'y' | 'toX' | 'toY'>, t: number,
): { x: number; y: number } {
  const clamped = Math.max(0, Math.min(JUMP_S, t));
  const u = clamped / JUMP_S;
  const tx = jump.toX ?? jump.x;
  const ty = jump.toY ?? jump.y;
  return {
    x: Math.round(jump.x + (tx - jump.x) * u),
    y: Math.round(jump.y + (ty - jump.y) * u) - jumpHeight(clamped),
  };
}

function drawJumpSparks(ctx: Ctx, jump: JumpFx, rarity: RarityId) {
  if ((rarity !== 'epic' && rarity !== 'legendary') || jump.intensity === 'small' || jump.t <= 0) return;
  const color = RARITY[rarity].color;
  for (let k = 1; k <= TRAIL_COUNT; k++) {
    const sampleT = jump.t - TRAIL_STEP_S * k;
    if (sampleT <= 0) break;
    const pt = jumpPoint(jump, sampleT);
    const next = jumpPoint(jump, Math.min(JUMP_S, sampleT + TRAIL_STEP_S));
    const vx = next.x - pt.x;
    const vy = next.y - pt.y;
    const len = Math.hypot(vx, vy);
    const nx = len > 0.001 ? -vy / len : 1;
    const ny = len > 0.001 ? vx / len : 0;
    const sign = k % 2 === 0 ? 1 : -1;
    const offset = sign * (k <= 2 ? 1 : 2);
    const sx = Math.round(pt.x + nx * offset);
    const sy = Math.round(pt.y + ny * offset);

    if (rarity === 'legendary') {
      if (k <= 2) {
        R(ctx, sx - 1, sy, 3, 1, color);
        R(ctx, sx, sy - 1, 1, 3, color);
        R(ctx, sx, sy, 1, 1, '#fff8e1');
      } else if (k === 3) {
        R(ctx, sx, sy, 2, 2, color);
      } else {
        R(ctx, sx, sy, 1, 1, color);
      }
    } else if (k <= 2) {
      R(ctx, sx, sy, 2, 2, color);
    } else {
      R(ctx, sx, sy, 1, 1, color);
    }
  }
}

/** 수면 물고기 점프 — 이륙 물보라와 목표 포물선 이동, 등급 꼬리 스파클을 포함한 단일 점프를 그린다 */
export function drawFishJump(ctx: Ctx, jump: JumpFx, style: FishArtStyle = DEFAULT_FISH_ART_STYLE) {
  if (jump.reducedMotion || jump.t < 0 || jump.t >= JUMP_S) return;
  const fish = fishById(jump.fishId);
  if (!fish) return;

  const hasTarget = jump.toX != null
    && jump.toY != null
    && Math.hypot(jump.toX - jump.x, jump.toY - jump.y) >= MIN_JUMP_TRAVEL_PX;

  if (jump.t < TAKEOFF_SPLASH_S) {
    drawWaterSplash(ctx, jump.x, jump.y, jump.t / TAKEOFF_SPLASH_S, false);
  } else if (!hasTarget && jump.t > JUMP_S - LANDING_SPLASH_S) {
    drawWaterSplash(ctx, jump.x, jump.y, (jump.t - (JUMP_S - LANDING_SPLASH_S)) / LANDING_SPLASH_S, true);
  }

  const h = jumpHeight(jump.t);
  if (h <= 0) return;

  const form = jump.form ?? 'normal';
  const pt = jumpPoint(jump, jump.t);
  const flip = hasTarget ? jump.toX! >= jump.x : jump.t > JUMP_S / 2;
  drawJumpSparks(ctx, jump, fish.rarity);
  const art = fishArt(style);
  art.drawCentered(ctx, fish, pt.x, pt.y, {
    scale: JUMP_FISH_SCALE,
    form,
    flip,
  });
}

export function drawFishingGear(ctx: Ctx, v: GearView) {
  if (v.phase === 'idle' || !v.school) return;
  const bob = v.reducedMotion ? 0 : v.phase === 'bite' ? Math.sin(v.t * 30) * 2 : Math.sin(v.t * 2);
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

// 타이밍 바 — 중앙 노란 존 = GOOD, 그 안의 빨간 존 = PERFECT (R6b + 파워 게이트 보너스)
export function drawTimingBar(ctx: Ctx, v: GearView) {
  if (v.phase !== 'bite' || v.biteT === null) return;
  // 머리 위는 닉네임과 말풍선 자리라, 게이지는 배(또는 캐릭터) 아래에 그린다
  const bw = 44, bh = 5;
  const bx = v.player.x - bw / 2, by = v.player.y + 12;
  R(ctx, bx - 1, by - 1, bw + 2, bh + 2, UI.shadow);
  R(ctx, bx, by, bw, bh, '#26364f');
  if (v.zone > 0.02) {
    const zw = bw * v.zone;
    R(ctx, bx + (bw - zw) / 2, by, zw, bh, 'rgba(255,213,79,0.85)');
  }
  if (v.red && v.red > 0.02) {
    const rw = bw * v.red;
    R(ctx, bx + (v.redCenter ?? 0.5) * bw - rw / 2, by, rw, bh, 'rgba(239,83,80,0.9)');
  }
  const cx = bx + Math.min(v.biteT, 1) * bw;
  R(ctx, cx - 1, by - 2, 2, bh + 4, '#fff');
}

// 판정 글자 색은 타이밍 바의 영역 색(빨강 PERFECT, 노랑 GOOD)과 같다
const JUDGMENT_STYLE = {
  perfect: { text: 'PERFECT', color: '#ef5350' },
  good: { text: 'GOOD', color: '#ffd54f' },
} as const;
const JUDGMENT_FONT_PX = 10;

/** 판정 순간 사라진 타이밍 바 자리에 판정 글자를 그린다 */
export function drawJudgmentFx(ctx: Ctx, v: Pick<GearView, 'player'>, fx: JudgmentFx) {
  const style = JUDGMENT_STYLE[fx.grade];
  label(ctx, style.text, v.player.x, v.player.y + 17, style.color, JUDGMENT_FONT_PX);
}
