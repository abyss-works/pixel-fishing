// 게임 상태 오버레이 스프라이트 — 군집/낚싯줄·찌/타이밍 바처럼 "상태를 월드 좌표에 그리는" 것들.
// 상태는 파라미터(FieldView 조각)로만 받는다 — React/게임 규칙 직접 의존 금지 (계층: 단위 스프라이트)
import { R, label, UI } from '../common.js';
import type { Ctx } from '../common.js';
import { SPOTS } from '../../../content/spots';
import type { School } from '../../../world/types';
import { FISH } from '../../../content/fish';
import type { FormId } from '../../../content/fish';
import { fishColors, fishRings, fishSprite } from '../../../content/sprites/index.js';
import { drawSprite } from '../sprite.js';
import { JUMP_S, jumpHeight, orbit } from './schoolView.js';

const fishById = (id: string) => FISH.find(f => f.id === id);

export interface GearView {
  player: { x: number; y: number };
  school: School | null;
  phase: string;
  biteT: number | null;
  zone: number;
  /** 빨간 존(PERFECT) 폭 — 파워 게이트 초과 보너스. 없으면 그리지 않는다 */
  red?: number;
  t: number;
  /** catch 전이 후 경과 초 — 훅 점프 연출. catch가 아니면 null */
  catchT?: number | null;
  catchFish?: { id: string; form: FormId } | null;
}

/** 어종별 색 배열 캐시 — 매 프레임 배열을 새로 만들면 래스터 캐시 키 계산만 늘어난다 */
const COLOR_CACHE = new Map<string, string[]>();
function colorsOf(fishId: string, form: FormId): string[] | null {
  const key = `${fishId}|${form}`;
  let c = COLOR_CACHE.get(key);
  if (!c) {
    const fish = fishById(fishId);
    if (!fish) return null;
    c = fishColors(fish, form, true);
    COLOR_CACHE.set(key, c);
  }
  return c;
}

/** zoom = 마커 크기 보정(1 기본). 미니맵처럼 pack 좌표를 축소 그리는 캔버스에서 지도가 커지면
 *  마커가 화면에서 쪼그라들므로, renderWorldMap이 1/s를 넣어 **표시 크기를 일정하게** 유지한다.
 *  어군은 어종과 무관한 검은 점 마커다(어종 스프라이트는 쓰지 않는다 — 사용자 결정). view가 있으면
 *  입질 중인 어군만 찌 쪽으로 좁게 몬다. */
export function drawSchools(ctx: Ctx, schools: School[], boat: number, t: number,
                            lockLabel = true, zoom = 1, view?: GearView) {
  for (const s of schools) {
    const req = SPOTS.find(sp => sp.id === s.spot)!;
    const locked = boat < req.boatTier;
    R(ctx, s.x - 12 * zoom, s.y - 8 * zoom, 24 * zoom, 16 * zoom, 'rgba(255,255,255,0.05)');
    const bite = view?.school?.id === s.id && view.phase === 'bite';
    for (let i = 0; i < 3; i++) {
      const o = orbit(i, t, bite);
      const fx = s.x + o.dx * zoom, fy = s.y + o.dy * zoom;
      const c = locked ? 'rgba(0,0,0,0.3)' : 'rgba(8,25,38,0.55)';
      R(ctx, fx - 3 * zoom, fy - 1 * zoom, 6 * zoom, 2 * zoom, c);
      R(ctx, fx + 3 * zoom, fy - 2 * zoom, 2 * zoom, 4 * zoom, c);
    }
    if (locked && lockLabel) label(ctx, `배 ${req.boatTier}단계`, s.x, s.y - 11, UI.danger, 8);
  }
}

/** 훅 점프 — 잡은 물고기가 찌 자리에서 수면 위로 한 번 튀어오른다. 캔버스 연출은 필드만 담당한다 */
export function drawHookJump(ctx: Ctx, v: GearView) {
  if (v.phase !== 'catch' || !v.school || v.catchT == null || !v.catchFish) return;
  const h = jumpHeight(v.catchT);
  if (h <= 0) return;
  const fish = fishById(v.catchFish.id);
  if (!fish) return;
  const colors = colorsOf(fish.id, v.catchFish.form);
  if (!colors) return;
  const sprite = fishSprite(fish, v.catchFish.form);
  // 정점을 지나면 뒤집혀 떨어진다 — 한 번 튀는 느낌
  drawSprite(ctx, sprite, colors, 1, v.school.x - sprite.w / 2, v.school.y - sprite.h / 2 - h,
             { ...fishRings(fish), flip: v.catchT > JUMP_S / 2 });
}

export function drawFishingGear(ctx: Ctx, v: GearView) {
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

// 타이밍 바 — 중앙 노란 존 = GOOD, 그 안의 빨간 존 = PERFECT (R6b + 파워 게이트 보너스)
export function drawTimingBar(ctx: Ctx, v: GearView) {
  if (v.phase !== 'bite' || v.biteT === null) return;
  const bw = 44, bh = 5;
  const bx = v.player.x - bw / 2, by = v.player.y - 30;
  R(ctx, bx - 1, by - 1, bw + 2, bh + 2, UI.shadow);
  R(ctx, bx, by, bw, bh, '#26364f');
  if (v.zone > 0.02) {
    const zw = bw * v.zone;
    R(ctx, bx + (bw - zw) / 2, by, zw, bh, 'rgba(255,213,79,0.85)');
  }
  if (v.red && v.red > 0.02) {
    const rw = bw * v.red;
    R(ctx, bx + (bw - rw) / 2, by, rw, bh, 'rgba(239,83,80,0.9)');
  }
  const cx = bx + Math.min(v.biteT, 1) * bw;
  R(ctx, cx - 1, by - 2, 2, bh + 4, '#fff');
}
