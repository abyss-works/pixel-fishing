// 유물 레지스트리 — 지역별 1개 (spec/bounty-hunting.md 유물절).
// 유물은 네임드 납품으로 얻은 교환 재료(수치는 items 축)로 맞바꾼 영구 소유물이다.
// 슬롯·장착이 없어 소유 목록(state.artifacts)이 곧 효과다. 효과 수치는 data에 두고
// 문장(로어·효과 설명)에는 손으로 숫자를 적지 않는다 — UI가 data에서 뽑는다.
// 행 추가 = 여기 1행 (무결성은 artifacts.test가 자동 검증).
import type { RarityId } from './rarity.js';
import type { BountyZone } from './bounties.js';

export interface ArtifactEffects {
  /** 항해 속도 가산율 (예: 0.03 = +3%) */
  sail?: number;
  /** 도보 속도 가산율 */
  walk?: number;
  /** 밤 이동 감속 면역 */
  nightImmune?: boolean;
  /** 미끼가 할인율 (예: 0.25 = 25% 감소) */
  baitDiscount?: number;
  /** 도전권 유효 기간 배수 (예: 2 = 2배) — 훅만 파둔다, 쓰는 유물은 아직 없다 */
  challengeWindowMult?: number;
}

export interface Artifact {
  id: string;
  name: string;
  zone: BountyZone;
  /** 유물 급 — 당분간 희귀만 둔다 (일반은 평범해서 제외) */
  grade: RarityId;
  /** 교환 재료 — items 축 id/이름. 네임드 납품 시 1개 지급, 교환 시 1개 소모 */
  materialId: string;
  materialName: string;
  lore: string;
  effects: ArtifactEffects;
}

export const ARTIFACTS: readonly Artifact[] = [
  { id: 'abyss-angler', name: '심해아귀', zone: 'pacific', grade: 'rare',
    materialId: 'mat-abyss-lantern', materialName: '아귀의 등불',
    lore: '심해의 아귀는 등불 하나 달고 다닌다. 그 빛 아래에서는 밤이 밤이 아니다.',
    effects: { sail: 0.03, nightImmune: true } },
  { id: 'wreck-compass', name: '침선의 나침반', zone: 'seasia', grade: 'rare',
    materialId: 'mat-wreck-compass', materialName: '이끼 낀 나침반',
    lore: '코론 침선에서 건져 올린 나침반. 바늘이 가리키는 곳에 물길이 있다.',
    effects: { walk: 0.07, sail: 0.07 } },
  { id: 'varuna-scale', name: '바루나의 저울', zone: 'indian', grade: 'rare',
    materialId: 'mat-varuna-weight', materialName: '녹슨 저울추',
    lore: '남인도양의 왕이 쓰던 저울이라 한다. 올려놓은 것마다 값이 가벼워진다.',
    effects: { baitDiscount: 0.25 } },
];

const ARTIFACT_BY_ID = new Map(ARTIFACTS.map(a => [a.id, a]));

/** id → 유물. 없는 id는 undefined */
export const artifactById = (id: string): Artifact | undefined => ARTIFACT_BY_ID.get(id);

/** 해역의 유물 — 지역별 1개가 계약이라 없으면 undefined */
export const artifactOfZone = (zone: BountyZone): Artifact | undefined =>
  ARTIFACTS.find(a => a.zone === zone);
