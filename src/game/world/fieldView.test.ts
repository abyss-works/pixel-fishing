import { describe, expect, it } from 'vitest';
import { FIELD_VIEW, mobileFieldView } from './fieldView';
import { cameraFor } from '../rendering/canvas/scenes/camera';

describe('FIELD_VIEW', () => {
  it('PC 필드 시야는 448x252다', () => {
    expect(FIELD_VIEW).toEqual({ w: 448, h: 252 });
  });
});

describe('mobileFieldView', () => {
  it('폭은 252 월드 픽셀, 높이는 스테이지 높이 ÷ 폭 × 252에서 소수를 버린다', () => {
    expect(mobileFieldView(390, 700)).toEqual({ w: 252, h: 452 }); // 700/390*252 = 452.3
    expect(mobileFieldView(360, 640)).toEqual({ w: 252, h: 448 }); // 정확히 448
  });

  it('스테이지 폭이 같아도 높이에 따라 시야 높이가 달라진다', () => {
    expect(mobileFieldView(400, 800).h).toBeGreaterThan(mobileFieldView(400, 600).h);
  });

  it('스테이지 크기를 아직 모르면(0) PC 시야를 돌려준다', () => {
    expect(mobileFieldView(0, 0)).toEqual(FIELD_VIEW);
    expect(mobileFieldView(390, 0)).toEqual(FIELD_VIEW);
  });
});

describe('cameraFor', () => {
  const world = { w: 1000, h: 800 };

  it('플레이어를 시야 가운데에 둔다', () => {
    expect(cameraFor({ x: 500, y: 400 }, world.w, world.h, { w: 252, h: 452 })).toEqual({ x: 374, y: 174 });
  });

  it('월드 경계에서 멈춘다', () => {
    const view = { w: 252, h: 452 };
    expect(cameraFor({ x: 0, y: 0 }, world.w, world.h, view)).toEqual({ x: 0, y: 0 });
    expect(cameraFor({ x: 1000, y: 800 }, world.w, world.h, view)).toEqual({ x: 748, y: 348 });
  });

  it('시야가 월드보다 크면 0에 둔다', () => {
    expect(cameraFor({ x: 50, y: 50 }, 100, 100, { w: 252, h: 452 })).toEqual({ x: 0, y: 0 });
  });

  it('PC 시야로는 기존 448x252 기준과 같다', () => {
    expect(cameraFor({ x: 500, y: 400 }, world.w, world.h, FIELD_VIEW)).toEqual({ x: 276, y: 274 });
  });
});
