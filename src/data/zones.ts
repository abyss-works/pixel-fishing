// 존 계층 트리 — zone은 **범위(range)**(존 아래 존), spot은 **조업 어군 오브젝트**.
// 재정의 계약: spec/zone-tree.md · 결정: decisions/zone-tree.md (사용자 확정 2026-08-28).
// 이전 모델("zone = 로어 단위, spot = 추첨 수역 범위")에서는 범위와 오브젝트가 1:1로
// 뭉쳐 구역/수역 이름이 충돌했다. 이제 셀은 존만 알고, 스팟은 존 안에 배치된 어군이다.
//
// 하위 존 id는 스팟 id와 **같은 문자열**을 쓴다(deep 존 + deep 스팟) — ZoneId/SpotId가
// 별개 타입이라 충돌하지 않고, "그 범위의 어군" 대응이 이름에서 읽힌다(사용자 확정).
// spot 자체(spots.ts — id·fish.spot 소속)는 절대 불변. zone은 그 위의 조회 뷰다.
// entryBoat = 이 존으로 진입할 때 필요한 배 tier — **최상위 경계 3곳만** 존재한다.
// 하위 존(해구 등)은 항해 가능, 캐스팅만 스팟의 배 레벨을 서버가 검증한다.
import { SPOTS } from './spots.js';
import type { SpotId, Spot } from './spots.js';
import type { RegionId } from './places.js';

export type ZoneId =
  | 'village' | 'pacific' | 'seasia' | 'indian'                          // 최상위 존
  | 'deep' | 'dragonhole' | 'coron' | 'barrierreef' | 'southindian';     // 하위 존 (id = 스팟 id)

/** 씬 지역 — 최상위 존만 명시한다. 하위 존은 부모 체인으로 파생(zoneGroup). */
type TopGroup = Extract<RegionId, 'village' | 'world'>;

export interface Zone {
  id: ZoneId;
  /** 상위 존 — 최상위 존은 생략 */
  parent?: ZoneId;
  name: string;
  shortName: string;
  group?: TopGroup;
  tagline: string;
  lore: string;
  /** 팁·조작 — 씬 조작 안내는 씬 공통이라 최상위 존만 둔다. 하위 존은 부모 폴백(zoneTips) */
  tips?: string[];
  controls?: string[];
  /** 이 범위 안에 배치된 어군(스팟) — 하위 존은 자기 범위의 스팟만 */
  spots: SpotId[];
  /** 진입 게이트(배 tier) — 최상위 경계에만 존재. 없으면 자유 통행 */
  entryBoat?: number;
  gateMsg?: string;
}

const DATA: Zone[] = [
  {
    id: 'village',
    name: '고향 물',
    shortName: '마을',
    group: 'village',
    tagline: '모든 낚시꾼의 이야기가 시작되는 곳',
    lore: '당신이 나고 자란 조용한 마을. 집 앞 연못과 마을을 가로지르는 강에는 어릴 적부터 봐 온 물고기들이 산다. 하지만 강을 따라 남쪽으로 내려가면 포구 너머로 바다가 열려 있다 — 배 한 척만 있다면.',
    tips: [
      '연못과 강은 배 없이 낚시할 수 있어요.',
      '강 다리를 건너 남쪽 포구로 가면 넓은 바다로 출항할 수 있어요 (배 필요).',
      '포구 옆 목공소에서 배를 살 수 있어요.',
      '집 문 앞에 서면 자동으로 집에 들어가요.',
    ],
    controls: [
      '이동: 방향키 또는 WASD',
      '낚시: 물고기 군집 옆에서 스페이스(또는 화면 클릭)',
    ],
    spots: ['pond', 'river'],
  },
  {
    id: 'pacific',
    name: '태평양',
    shortName: '태평양',
    group: 'world',
    tagline: '익숙한 바다, 그러나 그 아래는 아직 아무도 모른다',
    lore: '한반도 남단 항구에서 출항한 넓은 태평양. 낮에는 고등어 떼가 수면을 스치지만, 해도에는 "마리아나 해구"라 적힌 검은 물이 있다. 그 깊이의 바닥까지 내려가 본 낚시꾼은 아직 없다.',
    tips: [
      '항해 속도는 배가 좋을수록 빨라져요.',
      '어두운 물(마리아나 해구)은 더 튼튼한 배가 있어야 낚시할 수 있어요.',
      '항구에 접안하면 정비(판매·강화·조선소)를 할 수 있고, 여객선으로 마을에 돌아갈 수 있어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
    spots: ['sea'],
  },
  {
    id: 'deep',
    parent: 'pacific',
    name: '마리아나 해구',
    shortName: '해구',
    tagline: '지구에서 가장 깊은 물',
    lore: '밑이 보이지 않는 어둠이 수면 아래로 내려앉는다. 여기까지 오는 배는 많지 않다.',
    spots: ['deep'],
  },
  {
    id: 'seasia',
    name: '동남아&오세아니아',
    shortName: '동남아',
    group: 'world',
    tagline: '햇살이 내리쬐는 얕은 바다, 생명이 모이는 곳',
    lore: '루손 해협을 지나면 바다 빛이 달라진다. 바다 한가운데 탁 파인 검은 구멍 — "드래곤 홀"은 용이 잠든 우물이라 하고, 팔라완 섬 그늘의 코론 바다는 밤마다 철이 우는 소리가 난다고 한다. 그리고 그 너머, 세계에서 가장 화려한 산호 정원이 햇살을 머금고 있다.',
    tips: [
      '세 낚시터(드래곤 홀 · 코론 침선 지대 · 그레이트 배리어 리프)는 모두 정크선으로 갈 수 있어요.',
      '코론의 침몰선 틈에는 커다란 것이 숨어 있고, 드래곤 홀에는 용이 잠들었다는 소문이 있어요.',
      '마닐라항에서 정비하고, 여객선으로 마을에 다녀올 수 있어요.',
      '말라카 해협 너머 서쪽 바다(인도양)는 대양선이 있어야 건널 수 있어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
    // 최상위 스팟 없음 — 열린 바다('2')는 통행 전용. 동남아 일반 어종은 미래 가산 여지.
    spots: [],
    entryBoat: 3,
    gateMsg: '정크선(3단계)가 있어야 동남아&오세아니아 해역에 들어설 수 있다.',
  },
  {
    id: 'dragonhole',
    parent: 'seasia',
    name: '드래곤 홀',
    shortName: '드래곤 홀',
    tagline: '한가운데 움푹 꺼진 구멍',
    lore: '주변보다 한층 어두운 물이 둥그렇게 가라앉아 있다. 그 아래가 어디로 통하는지는 아무도 모른다.',
    spots: ['dragonhole'],
  },
  {
    id: 'coron',
    parent: 'seasia',
    name: '코론 침선 지대',
    shortName: '코론',
    tagline: '침선들이 늘어선 물',
    lore: '배의 잔해들이 산호를 감싼 채 수면에 흔적을 남긴다. 그 그림자 사이를 천천히 지나가야 한다.',
    spots: ['coron'],
  },
  {
    id: 'barrierreef',
    parent: 'seasia',
    name: '그레이트 배리어 리프',
    shortName: '배리어 리프',
    tagline: '산호가 이어지는 장관',
    lore: '물이 얕을수록 빛깔이 많다. 어느 틈에 무엇이 숨었는지는 물빛이 조용히 알려준다.',
    spots: ['barrierreef'],
  },
  {
    id: 'indian',
    name: '인도양',
    shortName: '인도양',
    group: 'world',
    tagline: '향신료의 바다 — 남으로 갈수록 물이 차가워진다',
    lore: '말라카 해협을 지나면 바다가 넓어진다. 항구마다 후추와 계피 냄새가 배어 있고, 몬순은 옛부터 뱃사람의 시계였다. 그리고 남쪽 — 회청색으로 식어가는 물에는 아직 이름 붙지 않은 무언가가 산다.',
    tips: [
      '인도양 연안은 열려 있지만, 차가운 남인도양은 더 튼튼한 낚싯대가 필요해요.',
      '콜롬보 항에서 정비하고, 여객선으로 마을에 다녀올 수 있어요.',
      '동쪽 물길을 따라 돌아가면 동남아입니다.',
      '서쪽 수평선 너머는 아직 열리지 않았어요.',
    ],
    controls: [
      '항해: 방향키 또는 WASD',
      '낚시: 물고기 군집 위에서 스페이스(또는 화면 클릭)',
    ],
    spots: ['indian'],
    // 말라카 해협 게이트(구 travel requiredBoat 5)의 계승 — 1-2 동남아를 건너뛰고 인도양으로
    // 넘어가려면 tier5(증기선)가 필요하다(사용자 확정 2026-08-27).
    entryBoat: 5,
    gateMsg: '증기선(5단계)이 있어야 인도양 해역에 들어설 수 있다.',
  },
  {
    id: 'southindian',
    parent: 'indian',
    name: '남인도양',
    shortName: '남인도양',
    tagline: '회청색으로 식어가는 물',
    lore: '남쪽으로 갈수록 물이 차가워진다. 아직 이름 붙지 않은 것이 이 차가움 아래에 산다.',
    spots: ['southindian'],
  },
];

export const ZONES: readonly Zone[] = DATA;

/** 최상위 존 순서의 단일 출처 — 도감 서브탭·Tab 순환(등록 순서 = 마을→태평양→동남아→인도양).
 *  하위 존은 순환 대상이 아니다 — 로어는 셀 구역(하위 존)으로 자연 승격된다. */
export const ZONE_IDS: ZoneId[] = DATA.filter(z => !z.parent).map(z => z.id);

const ZONE_BY_ID = new Map(DATA.map(z => [z.id, z]));

/** id → 존. 없는 id는 undefined (호출부 계약상 정상 클라이언트에선 나오지 않는다) */
export const zoneById = (id: ZoneId): Zone | undefined => ZONE_BY_ID.get(id);

/** 최상위 존까지 부모 체인을 거슬러 올라간다 — 최상위 그룹핑(도감·통계)의 기본 연산 */
export function topZoneOf(id: ZoneId): ZoneId {
  let cur = ZONE_BY_ID.get(id);
  while (cur?.parent) cur = ZONE_BY_ID.get(cur.parent);
  return cur!.id;
}

/** 존이 속한 씬 지역 — 부모 체인의 최상위 group */
export function zoneGroup(id: ZoneId): TopGroup {
  let cur = ZONE_BY_ID.get(id);
  while (cur && !cur.group) cur = cur.parent ? ZONE_BY_ID.get(cur.parent) : undefined;
  return cur!.group!;
}

/** 팁 — 하위 존은 부모 것을 쓴다(씬 조작 안내는 씬 공통) */
export function zoneTips(id: ZoneId): string[] {
  let cur = ZONE_BY_ID.get(id);
  while (cur) {
    if (cur.tips) return cur.tips;
    cur = cur.parent ? ZONE_BY_ID.get(cur.parent) : undefined;
  }
  return [];
}

/** 조작 안내 — zoneTips와 같은 폴백 규칙 */
export function zoneControls(id: ZoneId): string[] {
  let cur = ZONE_BY_ID.get(id);
  while (cur) {
    if (cur.controls) return cur.controls;
    cur = cur.parent ? ZONE_BY_ID.get(cur.parent) : undefined;
  }
  return [];
}

// spot → 존 역색인 — 스팟이 배치된 존(하위 존 포함). spots.ts의 region 열(legacy)과 별개다.
const ZONE_OF_SPOT = new Map<SpotId, ZoneId>(
  DATA.flatMap(z => z.spots.map(s => [s, z.id] as const)),
);

/** 어군의 소속 존 — 미소속 어군은 undefined(발생하면 zones.test가 잡는다) */
export const zoneOfSpot = (spotId: SpotId): ZoneId | undefined => ZONE_OF_SPOT.get(spotId);

/** 어군의 최상위 존 — 도감 서브탭·통계 그룹핑(하위 존은 부모 쪽으로 합산) */
export const topZoneOfSpot = (spotId: SpotId): ZoneId | undefined => {
  const z = ZONE_OF_SPOT.get(spotId);
  return z ? topZoneOf(z) : undefined;
};

/** 씬 지역의 기본 존 — 위치를 못 읽을 때(부팅 직후 등) 지역 탭이 띄울 존.
 *  병합 바다는 고향 항구가 태평양에 있으니 pacific이 기본값이다. */
export const defaultZoneOfRegion = (region: RegionId): ZoneId =>
  region === 'village' ? 'village' : 'pacific';

/** 씬 지역에 속한 어군 목록 — 최상위 존 서브트리의 스팟 전부(지역 탭 가까운 어군 목록).
 *  병합 바다 = 3존 서브트리 전부(하위 존 스팟 포함). */
export const spotsOfRegion = (region: RegionId): Spot[] =>
  SPOTS.filter(s => {
    const z = ZONE_OF_SPOT.get(s.id);
    return z !== undefined && zoneGroup(z) === region;
  });

/** 존 서브트리의 어군 — 자기 존 + 모든 하위 존의 스팟(등급 분포 표 단위: 최상위 존 기준) */
export function subtreeSpots(id: ZoneId): Spot[] {
  const ids = DATA.filter(z => topZoneOf(z.id) === id).flatMap(z => z.spots);
  return SPOTS.filter(s => ids.includes(s.id));
}
