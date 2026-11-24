// 거점: 리스본항 (병합 바다 북대서양 동쪽 대륙 끝) — 항구 공통 배치에 수배판을 둔다.
import type { BasePack } from '../types';
import { BASE_REGION } from '../../content/places';
import { HARBORS } from '../regions/world';

const SALE_TITLE = '어시장';

export const LISBON_BASE: BasePack = {
  id: 'lisbon',
  name: '리스본항',
  region: BASE_REGION.lisbon,
  headline: '리스본항에서 시설을 눌러 정비해 보세요.',
  exitMsg: '출항했어요. 아조레스 해령이나 버뮤다 삼각지대의 어군 위에서 스페이스를 눌러 찌를 던져 보세요.',
  // 접안했던 항구 앞에서 이어서 나간다 — 팩 spawn(고향 항구)으로 텔레포트하지 않는다
  exitAt: { ...HARBORS.lisbon.departure },
  travel: { to: 'village', msg: '여객선을 타고 마을로 돌아왔어요.' },
  furniture: [
    { id: 'rank',   x: 36,  y: 58,  w: 40, h: 30, sprite: 'board',
      label: () => ({ title: '게시판', sub: '랭킹' }), labelDy: -4 },
    { id: 'bounty', x: 248, y: 54,  w: 40, h: 30, sprite: 'board',
      label: () => ({ title: '수배판', sub: '의뢰/토벌' }), labelDy: -8 },
    { id: 'rod',    x: 130, y: 90,  w: 50, h: 34, sprite: 'rodshop',
      label: i => ({ title: '공방', sub: `낚싯대 Lv.${i.rod}` }), labelDy: -8 },
    { id: 'boat',   x: 88,  y: 132, w: 48, h: 30, sprite: 'shipyard',
      label: i => ({ title: '조선소', sub: i.boatName }), labelDy: -3 },
    { id: 'sell',   x: 200, y: 94,  w: 44, h: 32, sprite: 'market',
      label: () => ({ title: SALE_TITLE, sub: '판매' }), windowTitle: SALE_TITLE, labelDy: -8 },
    { id: 'travel', x: 16,  y: 132, w: 56, h: 30, sprite: 'ferry',
      label: () => ({ title: '마을', sub: '집으로' }), labelDy: -2 },
    { id: 'ferry',  x: 196, y: 132, w: 56, h: 30, sprite: 'ferry',
      label: () => ({ title: '여객선', sub: '빠른 이동' }), labelDy: -2 },
    { id: 'exit',   x: 272, y: 104, w: 34, h: 56, sprite: 'boarding',
      label: () => ({ title: '승선', sub: '바다로' }), labelDy: 8 },
  ],
};
