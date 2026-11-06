import type { Point } from '../world/types';

// 모바일 원 패드의 판정 — 스테이지를 누른 자리에서 시작해 손가락을 따라간다.
// 화면 요소(고리와 손잡이)의 그림은 표현 계층이 이 결과로 그린다.

/** 이 거리(px)를 넘게 끌어야 패드가 생긴다. 넘기지 않고 떼면 짧게 누르기다 */
export const PAD_START_PX = 10;
/** 고리 지름(px) */
export const PAD_RING_PX = 112;
/** 손잡이 지름(px) */
export const PAD_KNOB_PX = 48;

/** 손잡이 중심이 고리 중심에서 벗어날 수 있는 최대 거리 — 손잡이가 고리 안에 머문다 */
const KNOB_REACH_PX = (PAD_RING_PX - PAD_KNOB_PX) / 2;

export interface Pad {
  /** 누른 자리 */
  origin: Point;
  /** 10px를 넘게 끌어 패드가 생겼는가. 한 번 생기면 뗄 때까지 유지된다 */
  active: boolean;
  /** 이동 방향(길이 1) 또는 멈춤(0, 0). 속도는 PC 이동과 같아 크기는 끄는 거리와 무관하다 */
  dir: Point;
  /** 고리 중심에서 손잡이 중심까지의 어긋남 */
  knob: Point;
}

export const startPad = (origin: Point): Pad => ({ origin, active: false, dir: { x: 0, y: 0 }, knob: { x: 0, y: 0 } });

/** 손가락이 at으로 옮겨 갔을 때의 패드 */
export function movePad(pad: Pad, at: Point): Pad {
  const dx = at.x - pad.origin.x;
  const dy = at.y - pad.origin.y;
  const distance = Math.hypot(dx, dy);
  const active = pad.active || distance > PAD_START_PX;
  if (!active) return pad;
  if (distance === 0) return { ...pad, active, dir: { x: 0, y: 0 }, knob: { x: 0, y: 0 } };
  const dir = { x: dx / distance, y: dy / distance };
  const reach = Math.min(distance, KNOB_REACH_PX);
  return { origin: pad.origin, active, dir, knob: { x: dir.x * reach, y: dir.y * reach } };
}

/** 뗀 누르기가 짧게 누르기(상호작용)인가 */
export const isTap = (pad: Pad): boolean => !pad.active;
