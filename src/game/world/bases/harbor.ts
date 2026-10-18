// 거점: 부산항 (고향 항구 — 병합 바다 태평양). 가구 배열의 순서가 거점 메뉴의 순서다.
import type { BasePack } from '../types';
import { WORLD_SPAWN } from '../regions/world';

export const HARBOR_BASE: BasePack = {
  id: 'harbor',
  region: 'world',
  headline: '부산항 — 시설을 클릭해 정비하자',
  exitMsg: '출항! 어군 위에서 스페이스로 캐스팅.',
  exitAt: { ...WORLD_SPAWN }, // 출항 = 팩 spawn(고향 항구 앞) — 고향 항구는 팩 spawn과 같은 자리
  travel: { to: 'village', msg: '여객선을 타고 마을로 돌아왔다.' },
  furniture: [
    { id: 'rank',   x: 36,  y: 58,  w: 40, h: 30, sprite: 'board',
      label: () => '게시판 · 랭킹', labelDy: -4 },
    { id: 'bounty', x: 248, y: 54,  w: 40, h: 30, sprite: 'board',
      label: () => '수배판 · 의뢰/토벌', labelDy: -8 },
    { id: 'rod',    x: 130, y: 90,  w: 50, h: 34, sprite: 'rodshop',
      label: i => `공방 · 낚싯대 Lv.${i.rod}`, labelDy: -8 },
    { id: 'boat',   x: 88,  y: 132, w: 48, h: 30, sprite: 'shipyard',
      label: i => `조선소 · ${i.boatName}`, labelDy: -3 },
    { id: 'sell',   x: 200, y: 94,  w: 44, h: 32, sprite: 'market',
      label: () => '어시장 · 판매', labelDy: -8 },
    { id: 'travel', x: 16,  y: 132, w: 56, h: 30, sprite: 'ferry',
      label: () => '마을 · 집으로', labelDy: -2 },
    { id: 'exit',   x: 272, y: 104, w: 34, h: 56, sprite: 'boarding',
      label: () => '승선 · 바다로', labelDy: 8 },
  ],
};
