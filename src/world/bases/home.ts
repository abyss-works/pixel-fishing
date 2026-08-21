// 거점: 집 (마을) — 시설 좌표·라벨은 구 world.ts HOME_FURNITURE에서 값 그대로 이식
// 뷰 좌표 320×180 기준. 스프라이트는 pixel/buildings.ts FURNITURE_SPRITES가 그린다.
import type { BasePack } from '../types';

export const HOME: BasePack = {
  id: 'home',
  headline: '나의 집 — 가구를 클릭해 정비하자',
  furniture: [
    { id: 'dex',  x: 36,  y: 58,  w: 40, h: 60, sprite: 'bookshelf',
      label: i => `책장 · 도감 ${i.dexCount}/${i.dexTotal}`, labelDy: -4 },
    { id: 'rod',  x: 130, y: 90,  w: 50, h: 34, sprite: 'workbench',
      label: i => `작업대 · 낚싯대 Lv.${i.rod}`, labelDy: -10 },
    { id: 'sell', x: 200, y: 94,  w: 44, h: 32, sprite: 'chest',
      label: () => '판매 궤짝', labelDy: -4 },
    { id: 'exit', x: 272, y: 104, w: 34, h: 56, sprite: 'door',
      label: () => '문 · 마을로', labelDy: -4 },
  ],
};
