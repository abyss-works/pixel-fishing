// 거점: 콜롬보항 (병합 바다 인도양) — 기존 항구 패턴을 따라 지역·문구만 조정했다.
// 향료전(shop 가구, 미끼 상점)은 미끼 구매처이며 이 항구 하나에만 있다.
import type { BasePack } from '../types';
import { COLOMBO_SPAWN } from '../regions/world';

export const COLOMBO_BASE: BasePack = {
  id: 'colombo',
  region: 'world',
  headline: '콜롬보항 — 시설을 눌러 정비해 보세요',
  exitMsg: '출항했어요. 향신료의 바다에서 스페이스를 눌러 찌를 던져 보세요.',
  // 접안했던 항구 앞에서 이어서 나간다 — 팩 spawn(고향 항구)으로 텔레포트하지 않는다
  exitAt: { ...COLOMBO_SPAWN },
  travel: { to: 'village', msg: '여객선을 타고 마을로 돌아왔어요.' },
  furniture: [
    { id: 'rank',   x: 36,  y: 58,  w: 40, h: 30, sprite: 'board',
      label: () => '게시판 · 랭킹', labelDy: -4 },
    { id: 'bounty', x: 200, y: 54,  w: 40, h: 30, sprite: 'board',
      label: () => '수배판 · 의뢰/토벌', labelDy: -8 },
    { id: 'rod',    x: 130, y: 90,  w: 50, h: 34, sprite: 'rodshop',
      label: i => `공방 · 낚싯대 Lv.${i.rod}`, labelDy: -8 },
    { id: 'boat',   x: 88,  y: 132, w: 48, h: 30, sprite: 'shipyard',
      label: i => `조선소 · ${i.boatName}`, labelDy: -3 },
    { id: 'sell',   x: 200, y: 94,  w: 44, h: 32, sprite: 'market',
      label: () => '어시장 · 판매', labelDy: -8 },
    // 출항 시설(x272~306,y104~160)과 겹치지 않도록 상단에 둔다.
    { id: 'shop',   x: 248, y: 54,  w: 40, h: 30, sprite: 'shop',
      label: () => '향료전 · 미끼', labelDy: -8 },
    { id: 'travel', x: 16,  y: 132, w: 56, h: 30, sprite: 'ferry',
      label: () => '마을 · 집으로', labelDy: -2 },
    { id: 'exit',   x: 272, y: 104, w: 34, h: 56, sprite: 'boarding',
      label: () => '승선 · 바다로', labelDy: 8 },
  ],
};
