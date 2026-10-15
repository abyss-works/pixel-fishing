// 네임드 어종 — 통상 어종(FISH)과 별도 레지스트리.
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
  // 바운티 헌팅 수배서다: 목격담·지급 조건 중심, 도감 설명과 문장을 공유하지 않는다
}

export const NAMED: readonly NamedFish[] = [
  { id: 'megalodon', name: '메갈로돈', zones: ['pacific'],
    color: '#7a8a99', shape: 'shark',
    lore: '고래를 한입에 물던 시대의 상어다. 이빨 하나가 어른 손바닥보다 크고, 빠진 이빨은 해구 바닥에 돌처럼 쌓인다. 바다가 식으며 모두 사라졌다고들 했지만 태평양은 그 말을 확인해 준 적이 없다. 배보다 넓은 그늘이 수면 아래를 지나가면 물고기들이 먼저 자리를 비운다.',
    poster: '조업 중이던 어선들이 같은 날 같은 그림자를 보고했다. 걷어 올린 그물은 칼로 벤 듯 끊겨 있었고 고기는 한 마리도 남지 않았다. 떠밀려 온 고래 옆구리에는 반달 모양으로 뜯긴 자국이 있었다. 도전에서 이기면 수배판에서 토벌을 마칠 수 있다.' },
  { id: 'leviathan', name: '리바이어던', zones: ['seasia'],
    color: '#3f5a78', shape: 'serpent',
    lore: '바다를 감아 도는 긴 몸의 뱀이다. 비늘은 방패를 겹쳐 세운 듯 촘촘하고, 숨을 내쉬면 수면이 끓듯 일어선다. 오래된 책들은 그것을 짐승이 아니라 바다 그 자체라고 적었다. 가라앉은 배들 사이에는 그 몸이 지나간 자리대로 휘어진 길이 남아 있다.',
    poster: '코론 침선 지대 뱃사람들이 입을 모아 긴 그림자를 증언했다. 밤마다 다른 배가 같은 자리에서 그것을 보았고, 그 아래 난파선의 돛대가 하나씩 꺾여 나갔다. 드래곤 홀 가장자리에서는 바람이 없는데도 물이 한쪽으로 감겨 돌았다. 도전에서 이기면 수배판에서 토벌을 마칠 수 있다.' },
  { id: 'ananta', name: '아난타', zones: ['indian'],
    color: '#2e4a5a', shape: 'serpent',
    lore: '끝이 없다는 이름을 가진 뱀이다. 여러 갈래로 갈라진 머리가 저마다 다른 쪽을 보고, 몸은 똬리를 튼 채 잠들어 있다. 바루나가 물을 다스리기 전부터 그 아래에서 세상을 받치고 있었다고 전한다. 남쪽 바다가 차가운 것은 그것이 아직 깨지 않았기 때문이라고들 한다.',
    poster: '남인도양을 지나던 상선이 끝이 보이지 않는 그림자 위를 반나절 동안 달렸다. 측연을 내린 선원은 바닥이 아니라 움직이는 비늘에 닿았다고 했다. 그 뒤로 그 항로의 물은 한 철 내내 차가웠다. 도전에서 이기면 수배판에서 토벌을 마칠 수 있다.' },
  // id는 수배 의뢰 id·도감 기록이 참조하므로 개명 전 값을 유지한다
  { id: 'elder-sixgill', name: '둔클레오스', zones: ['madagascar'], spot: 'comorodeep',
    color: '#3b4a52', shape: 'shark',
    lore: '이빨 대신 턱뼈 자체가 칼날로 갈린 갑주어다. 머리와 어깨를 덮은 골판은 강철 투구처럼 두껍고, 그 뒤로 이어진 몸은 둔하고 무겁다. 단단한 뼈를 가진 물고기가 드물던 때의 모습 그대로 코모로 심해 바닥을 돈다. 화석으로만 남았어야 할 것이 아직 그곳에서 숨을 쉰다.',
    poster: '코모로 앞바다에서 끌어 올린 닻이 이빨 자국 하나 없이 두 동강 나 있었다. 내려 보낸 그물 추는 바위가 아니라 쇠붙이를 두드리는 소리를 전해 왔다. 해협 쪽 어선들은 같은 것을 한 번도 보지 못했다. 도전에서 이기면 수배판에서 토벌을 마칠 수 있다.' },
];

const NAMED_BY_ID = new Map(NAMED.map(n => [n.id, n]));

/** id → 네임드 어종. 없는 id는 undefined */
export const namedById = (id: string): NamedFish | undefined => NAMED_BY_ID.get(id);

/** 수배서 사진용 Fish 껍데기 — 표시 전용, 저장 안 함.
 *  가격은 찍지 않는다 — 도감·수배 카드에 가격을 그리지 않으므로 상관없다. */
export const namedFishOf = (n: NamedFish): Fish => ({
  id: n.id, name: n.name, spot: 'deep', rarity: 'legendary', price: 0,
  color: n.color, shape: n.shape, lore: n.lore,
  variant: { name: n.name, color: n.color, lore: n.lore },
});
