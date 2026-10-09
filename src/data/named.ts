// 지명 수배 어종 — 통상 어종(FISH)과 별도 레지스트리 (decisions/bounty-hunting.md).
// 네임드는 특수 개념이다: 수주 중이 아니면 출현하지 않고, 일반 상점에 팔 수 없으며,
// 추첨 풀에 들지 않는다. 그래서 등급·가격·수역 소속(Fish의 계약)을 갖지 않는다.
// 출현 해역(zones)은 수배 의뢰 해역과 같다 (1-1 메갈로돈=태평양 · 1-2 리바이어던=동남아).
// 행 추가 = 여기 1행 (무결성은 named.test가 자동 검증).
import type { FishShape } from './fish.js';
import type { BountyZone } from './bounties.js';

export interface NamedFish {
  id: string;
  name: string;
  /** 출현 해역 — 최상위 존 단위. 수주 활성 시에만 이 해역들에서 확률/조건으로 나온다 */
  zones: readonly BountyZone[];
  color: string;
  shape: FishShape;
  lore: string;  // 수배서 문구 — 도감 평시 미노출이라 수배 목록에서만 읽힌다
}

export const NAMED: readonly NamedFish[] = [
  { id: 'megalodon', name: '메갈로돈', zones: ['pacific'],
    color: '#7a8a99', shape: 'shark',
    lore: '태평양 깊은 곳의 그림자. 수배서에서만 이름이 돈다.' },
  { id: 'leviathan', name: '리바이어던', zones: ['seasia'],
    color: '#3f5a78', shape: 'serpent',
    lore: '동남아 바다의 긴 그림자. 침선 지대 뱃사람들이 입을 모은다.' },
];

const NAMED_BY_ID = new Map(NAMED.map(n => [n.id, n]));

/** id → 지명 수배 어종. 없는 id는 undefined */
export const namedById = (id: string): NamedFish | undefined => NAMED_BY_ID.get(id);
