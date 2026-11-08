// 거점: 집 (마을) — 뷰 좌표 320×180 기준. 스프라이트는 픽셀 렌더링 FURNITURE_SPRITES가 그린다.
// 가구 배열의 순서가 거점 메뉴의 순서다.
import type { BasePack } from '../types';

export const HOME: BasePack = {
  id: 'home',
  name: '집',
  region: 'village',
  headline: '나의 집에서 가구를 눌러 정비해 보세요.',
  exitMsg: '마을이에요. 물가 어군에서 낚시해 보세요.',
  furniture: [
    { id: 'rank', x: 84,  y: 30,  w: 40, h: 30, sprite: 'board',
      label: () => ({ title: '게시판', sub: '랭킹' }), labelDy: -4 },
    { id: 'rod',  x: 130, y: 90,  w: 50, h: 34, sprite: 'workbench',
      label: i => ({ title: '작업대', sub: `낚싯대 Lv.${i.rod}` }), labelDy: -10 },
    { id: 'boat', x: 36,  y: 92,  w: 48, h: 30, sprite: 'shipyard',
      label: i => ({ title: '목공소', sub: i.boatName }), labelDy: -4 },
    { id: 'sell', x: 200, y: 94,  w: 44, h: 32, sprite: 'chest',
      label: () => ({ title: '궤짝', sub: '판매' }), labelDy: -4 },
    { id: 'wardrobe', x: 252, y: 40, w: 34, h: 46, sprite: 'wardrobe',
      label: () => ({ title: '옷장' }), labelDy: -4 },
    { id: 'exit', x: 272, y: 104, w: 34, h: 56, sprite: 'door',
      label: () => ({ title: '문', sub: '마을로' }), labelDy: -4 },
  ],
};
