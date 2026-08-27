// 거점: 콜롬보 항 (인도양) — harbor/manila 패턴 상속(manila 선례: 복제로 지역·문구만 조정).
// 미끼 상점(shop 가구)은 **미끼 릴리즈에서 추가**한다 — 지역 릴리즈 스코프 밖(사용자 결정).
import type { BasePack } from '../types';

export const COLOMBO_BASE: BasePack = {
  id: 'colombo',
  region: 'indian',
  headline: '콜롬보 항 — 시설을 클릭해 정비하자',
  exitMsg: '출항! 향신료의 바다에서 스페이스로 캐스팅.',
  travel: { to: 'village', msg: '여객선을 타고 마을로 돌아왔다.' },
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
