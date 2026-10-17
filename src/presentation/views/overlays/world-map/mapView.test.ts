import { describe, expect, it } from 'vitest';
import { FULL_VIEW, MAP_ZOOM_MAX, clampView, panBy, toScreen, zoomAt } from './mapView';

const W = 1280, H = 604;

describe('세계지도 보기 — 확대·끌기', () => {
  it('커서 아래 지점을 고정한 채 확대한다', () => {
    const v = zoomAt(FULL_VIEW, 2, 640, 302, W, H);
    expect(v.scale).toBe(2);
    expect(toScreen(v, 640, 302)).toEqual({ x: 640, y: 302 });
  });

  it('배율은 1~최대 배율 사이로 묶인다', () => {
    expect(zoomAt(FULL_VIEW, 0.5, 0, 0, W, H).scale).toBe(1);
    expect(zoomAt(FULL_VIEW, 100, 0, 0, W, H).scale).toBe(MAP_ZOOM_MAX);
  });

  it('끌면 지도가 손을 따라 움직이고, 지도 끝을 넘어가지 않는다', () => {
    const z = zoomAt(FULL_VIEW, 2, 0, 0, W, H); // 왼쪽 위를 확대 — 보기 창 x=0
    const moved = panBy(z, -100, 0, W, H);       // 왼쪽으로 끌기 → 오른쪽 땅이 보인다
    expect(moved.x).toBe(50);
    expect(panBy(z, 100, 0, W, H).x).toBe(0);     // 이미 왼쪽 끝
    expect(panBy(z, -1e6, -1e6, W, H)).toEqual({ scale: 2, x: W / 2, y: H / 2 });
  });

  it('전체 보기(배율 1)에서는 끌어도 움직이지 않는다', () => {
    expect(panBy(FULL_VIEW, 300, 200, W, H)).toEqual(FULL_VIEW);
    expect(clampView({ scale: 1, x: 50, y: 50 }, W, H)).toEqual(FULL_VIEW);
  });
});
