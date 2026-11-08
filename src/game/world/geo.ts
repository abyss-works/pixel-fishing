// 게임 좌표 ↔ 경위도 — 게임 좌표의 원점은 항해 창이 아니라 전지구 고정 원점(생성 마스크의 ORIGIN)이고
// 해상도는 CELLS_PER_DEG로 고정이다. 창을 넓히거나 줄여도 이 변환은 바뀌지 않는다.
import { CELL_W, CELL_H, ORIGIN, CELLS_PER_DEG } from './regions/generated/world.mask';
import type { Point } from './types';

export function gameToLonLat(x: number, y: number): { lon: number; lat: number } {
  return {
    lon: ORIGIN.lon + x / (CELL_W * CELLS_PER_DEG.lon),
    lat: ORIGIN.lat - y / (CELL_H * CELLS_PER_DEG.lat),
  };
}

export function lonLatToGame(lon: number, lat: number): Point {
  return {
    x: (lon - ORIGIN.lon) * CELLS_PER_DEG.lon * CELL_W,
    y: (ORIGIN.lat - lat) * CELLS_PER_DEG.lat * CELL_H,
  };
}
