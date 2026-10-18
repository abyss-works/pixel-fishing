// 거점: 투아마시나항 (병합 바다 마다가스카르) — 항구 공통 배치에 수배판을 둔다. 미끼 상점은 없다(콜롬보 단일 판매).
import type { BasePack } from '../types';
import { TOAMASINA_SPAWN } from '../regions/world';

export const TOAMASINA_BASE: BasePack = {
  id: 'toamasina',
  region: 'world',
  headline: '투아마시나항 — 시설을 클릭해 정비하자',
  exitMsg: '출항! 해협의 어군 위에서 스페이스로 캐스팅.',
  // 접안했던 항구 앞에서 이어서 나간다 — 팩 spawn(고향 항구)으로 텔레포트하지 않는다
  exitAt: { ...TOAMASINA_SPAWN },
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
