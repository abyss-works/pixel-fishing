// 거점: 집 (마을) — 뷰 좌표 320×180 기준. 스프라이트는 픽셀 렌더링 FURNITURE_SPRITES가 그린다.
// 가구 배열의 순서가 거점 메뉴의 순서다.
import type { BasePack } from '../types';

export const HOME: BasePack = {
  id: 'home',
  region: 'village',
  headline: '나의 집 — 가구를 클릭해 정비하자',
  exitMsg: '마을이다. 물가 어군에서 낚시하자.',
  furniture: [
    { id: 'rank', x: 84,  y: 30,  w: 40, h: 30, sprite: 'board',
      label: () => '게시판 · 랭킹', labelDy: -4 },
    { id: 'rod',  x: 130, y: 90,  w: 50, h: 34, sprite: 'workbench',
      label: i => `작업대 · 낚싯대 Lv.${i.rod}`, labelDy: -10 },
    { id: 'boat', x: 36,  y: 92,  w: 48, h: 30, sprite: 'shipyard',
      label: i => `목공소 · ${i.boatName}`, labelDy: -4 },
    { id: 'sell', x: 200, y: 94,  w: 44, h: 32, sprite: 'chest',
      label: () => '판매 궤짝', labelDy: -4 },
    { id: 'exit', x: 272, y: 104, w: 34, h: 56, sprite: 'door',
      label: () => '문 · 마을로', labelDy: -4 },
  ],
};
