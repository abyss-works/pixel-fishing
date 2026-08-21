// 거점: 항구 (대양) — 시설 좌표·라벨은 구 world.ts HARBOR_FURNITURE에서 값 그대로 이식
import type { BasePack } from '../types';

export const HARBOR_BASE: BasePack = {
  id: 'harbor',
  headline: '항구 — 시설을 클릭해 정비하자',
  furniture: [
    { id: 'dex',    x: 36,  y: 58,  w: 40, h: 60, sprite: 'office',
      label: i => `사무소 · 도감 ${i.dexCount}/${i.dexTotal}`, labelDy: -4 },
    { id: 'rod',    x: 130, y: 90,  w: 50, h: 34, sprite: 'rodshop',
      label: i => `공방 · 낚싯대 Lv.${i.rod}`, labelDy: -8 },
    { id: 'sell',   x: 200, y: 94,  w: 44, h: 32, sprite: 'market',
      label: () => '어시장', labelDy: -8 },
    { id: 'boat',   x: 88,  y: 132, w: 48, h: 30, sprite: 'shipyard',
      label: i => `조선소 · ${i.boatName}`, labelDy: -3 },
    { id: 'exit',   x: 272, y: 104, w: 34, h: 56, sprite: 'boarding',
      label: () => '승선 · 출항', labelDy: 8 },
    { id: 'travel', x: 16,  y: 132, w: 56, h: 30, sprite: 'ferry',
      label: () => '여객선 · 마을로', labelDy: -2 },
  ],
};
