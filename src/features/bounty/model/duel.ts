// 네임드 결투의 움직임 — 조우 창이 그리는 커서·존·속도. 판정 횟수 규칙(7히트 성공·4실패 탈락)은
// 게임 규칙(strikeChallenge)이 정본이고, 여기서는 그 시도를 어떻게 보여 줄지만 정한다.
// 판정 폭은 기존 노란 존(CHALLENGE_YELLOW)을 그대로 쓰고, 판정 함수도 기존 judgeTiming을 쓴다.
import { CHALLENGE_RED, CHALLENGE_YELLOW } from '../../../game/rules/balance';
import { judgeTiming } from '../../../game/rules/logic';

/** 쳐 내지 않고 이만큼(편도 기준) 지나가면 도주 1칸 — 2 = 한 번 왕복 */
export const DUEL_IDLE_SWEEPS = 2;

/** 편도 시간 — 낚싯대 바 속도로 시작해 맞힐 때마다 줄고, 하한에 닿으면 마지막 3번(5~7번째 명중)은 최고 속도다 */
const START_SWEEP_RATIO = 1;
const SPEEDUP_PER_HIT = 0.15;
const MIN_SWEEP_RATIO = 0.4;

/** 맞힌 횟수별 존 중심 — 좌우를 오가며 옮긴다. 존 폭이 바 밖으로 나가지 않는 값만 둔다 */
const ZONE_CENTERS = [0.5, 0.25, 0.72, 0.38, 0.8, 0.2, 0.62] as const;

/** 진행량 u(편도 1 = 1.0) → 커서 위치 0~1. 끝에서 돌아오며 왕복한다 */
export function duelCursor(u: number): number {
  const phase = ((u % 2) + 2) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/** 맞힌 횟수 → 존 중심. 목록을 넘으면 처음부터 돈다 */
export function duelZoneCenter(hits: number): number {
  const c = ZONE_CENTERS[hits % ZONE_CENTERS.length];
  const half = CHALLENGE_YELLOW / 2;
  return Math.min(Math.max(c, half), 1 - half);
}

/** 맞힌 횟수 → 편도 시간(ms). 기본은 낚싯대 바 시간이다 */
export function duelSweepMs(baseMs: number, hits: number): number {
  return Math.round(baseMs * Math.max(MIN_SWEEP_RATIO, START_SWEEP_RATIO - SPEEDUP_PER_HIT * hits));
}

/** 커서가 존 안에 있는가 — 존을 가운데로 옮겨 기존 판정 함수로 본다 */
export function duelHit(pos: number, center: number): boolean {
  return judgeTiming(pos - center + 0.5, CHALLENGE_YELLOW, CHALLENGE_RED) !== 'normal';
}
