// 지명 수배 어종 — 통상 어종(FISH)과 별도 레지스트리.
// 네임드는 특수 개념이다: 수주 중이 아니면 출현하지 않고, 일반 상점에 팔 수 없으며,
// 추첨 풀에 들지 않는다. 그래서 등급·가격·수역 소속(Fish의 계약)을 갖지 않는다.
// 출현 해역(zones)은 수배 의뢰 해역과 같다 (1-1 메갈로돈=태평양 · 1-2 리바이어던=동남아).
// 행 추가 = 여기 1행 (무결성은 named.test가 자동 검증).
import type { FishShape } from './fish.js';
import type { Fish } from './fish.js';
import type { BountyZone } from './bounties.js';
import type { SpotId } from './spots.js';

export interface NamedFish {
  id: string;
  name: string;
  /** 출현 해역 — 최상위 존 단위. 수주 활성 시에만 이 해역들에서 확률/조건으로 나온다 */
  zones: readonly BountyZone[];
  /** 출현 수역 한정 — 미기재면 해역 안 모든 수역. 특화 수역에만 사는 네임드가 쓴다 */
  spot?: SpotId;
  color: string;
  shape: FishShape;
  lore: string;  // 도감 문구 — 도감 네임드 분류에서만 읽힌다
  poster: string;  // 수배서 본문 — 수배판에서만 읽힌다. 로어와 같은 말(한다체)이나
  // 현상금 의뢰 어음이다: 목격담·지급 조건 중심, 도감 설명과 문장을 공유하지 않는다
}

export const NAMED: readonly NamedFish[] = [
  { id: 'megalodon', name: '메갈로돈', zones: ['pacific'],
    color: '#7a8a99', shape: 'shark',
    lore: '태평양 깊은 곳의 그림자. 수배서에서만 이름이 돈다.',
    poster: '조업 중이던 어선 세 척이 같은 그림자를 보고했다. 건져 올린 그물은 매번 비어 있었다. 챌린지에 성공하면 수배판에서 의뢰를 완료할 수 있다.' },
  { id: 'leviathan', name: '리바이어던', zones: ['seasia'],
    color: '#3f5a78', shape: 'serpent',
    lore: '동남아 바다의 긴 그림자. 침선 지대 뱃사람들이 입을 모은다.',
    poster: '침선 지대 뱃사람들이 입을 모아 긴 그림자를 증언했다. 밤마다 다른 배가 같은 자리에서 목격했다. 챌린지에 성공하면 수배판에서 의뢰를 완료할 수 있다.' },
  { id: 'ananta', name: '아난타', zones: ['indian'],
    color: '#2e4a5a', shape: 'serpent',
    lore: '남인도양 차가운 물에 잠든 세계뱀. 바루나보다 오래된 질서.',
    poster: '차가운 남인도양에서 바루나보다 오래된 그림자가 움직인다. 본 자는 깊이를 헤아리지 못했다. 챌린지에 성공하면 수배판에서 의뢰를 완료할 수 있다.' },
  { id: 'elder-sixgill', name: '심연의 장로', zones: ['madagascar'], spot: 'comorodeep',
    color: '#3b4a52', shape: 'shark',
    lore: '코모로 심해 아래에서 가장 오래 산 그림자. 수배서에서만 이름이 돈다.',
    poster: '코모로 앞바다 아래에서 배보다 긴 그림자가 올라왔다 가라앉았다. 해협 쪽에서는 한 번도 보이지 않았다. 챌린지에 성공하면 수배판에서 의뢰를 완료할 수 있다.' },
];

const NAMED_BY_ID = new Map(NAMED.map(n => [n.id, n]));

/** id → 지명 수배 어종. 없는 id는 undefined */
export const namedById = (id: string): NamedFish | undefined => NAMED_BY_ID.get(id);

/** 수배서 사진용 Fish 껍데기 — 표시 전용, 저장 안 함.
 *  가격은 찍지 않는다 — 도감·수배 카드에 가격을 그리지 않으므로 상관없다. */
export const namedFishOf = (n: NamedFish): Fish => ({
  id: n.id, name: n.name, spot: 'deep', rarity: 'legendary', price: 0,
  color: n.color, shape: n.shape, lore: n.lore,
  variant: { name: n.name, color: n.color, lore: n.lore },
});
