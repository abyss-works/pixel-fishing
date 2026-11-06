import { describe, expect, it } from 'vitest';
import { PAD_KNOB_PX, PAD_RING_PX, isTap, movePad, startPad } from './movePad';

const origin = { x: 100, y: 200 };

describe('movePad', () => {
  it('고리는 지름 112px, 손잡이는 지름 48px다', () => {
    expect(PAD_RING_PX).toBe(112);
    expect(PAD_KNOB_PX).toBe(48);
  });

  it('누른 자리에서 10px 안에서는 패드가 생기지 않고 방향도 없다', () => {
    const pad = movePad(startPad(origin), { x: 110, y: 200 });
    expect(pad.active).toBe(false);
    expect(pad.dir).toEqual({ x: 0, y: 0 });
  });

  it('10px를 넘게 끌면 패드가 생기고 방향은 끄는 각도 그대로 단위 벡터다', () => {
    const right = movePad(startPad(origin), { x: 111, y: 200 });
    expect(right.active).toBe(true);
    expect(right.dir).toEqual({ x: 1, y: 0 });

    const diagonal = movePad(startPad(origin), { x: 130, y: 240 }); // (30, 40) 길이 50
    expect(diagonal.dir.x).toBeCloseTo(0.6);
    expect(diagonal.dir.y).toBeCloseTo(0.8);
  });

  it('위쪽 방향은 y가 음수다', () => {
    const up = movePad(startPad(origin), { x: 100, y: 150 });
    expect(up.dir).toEqual({ x: 0, y: -1 });
  });

  it('손잡이는 손가락을 따라가되 고리 안(중심에서 32px)을 넘지 않는다', () => {
    const near = movePad(startPad(origin), { x: 120, y: 200 });
    expect(near.knob).toEqual({ x: 20, y: 0 });
    const far = movePad(startPad(origin), { x: 300, y: 200 });
    expect(far.knob).toEqual({ x: 32, y: 0 });
  });

  it('한 번 패드가 생기면 10px 안으로 돌아와도 유지되고 정확히 원점이면 멈춘다', () => {
    let pad = movePad(startPad(origin), { x: 150, y: 200 });
    pad = movePad(pad, { x: 105, y: 200 });
    expect(pad.active).toBe(true);
    expect(pad.dir).toEqual({ x: 1, y: 0 });
    pad = movePad(pad, origin);
    expect(pad.active).toBe(true);
    expect(pad.dir).toEqual({ x: 0, y: 0 });
    expect(pad.knob).toEqual({ x: 0, y: 0 });
  });
});

describe('isTap', () => {
  it('패드가 생기지 않은 채 뗀 누르기는 짧게 누르기다', () => {
    expect(isTap(startPad(origin))).toBe(true);
    expect(isTap(movePad(startPad(origin), { x: 105, y: 203 }))).toBe(true);
  });

  it('패드가 생겼으면 짧게 누르기가 아니다', () => {
    expect(isTap(movePad(startPad(origin), { x: 140, y: 200 }))).toBe(false);
  });
});
