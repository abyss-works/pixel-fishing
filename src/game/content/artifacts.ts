// 유물 레지스트리 — 지역별 하나만 제공한다.
// 유물은 네임드 토벌로 얻은 교환 재료(수치는 items 축)로 맞바꾼 영구 소유물이다.
// 슬롯·장착이 없어 소유 목록(state.artifacts)이 곧 효과다. 효과 수치는 data에 두고
// 문장(로어·효과 설명)에는 손으로 숫자를 적지 않는다 — UI가 data에서 뽑는다.
// 행 추가 = 여기 1행 (무결성은 artifacts.test가 자동 검증).
import type { RarityId } from './rarity.js';
import type { BountyZone } from './bounties.js';

export interface ArtifactEffects {
  /** 항해 속도 가산율 (예: 0.03 = +3%) */
  sail?: number;
  /** 네임드 결투 가속 단위 감소율 — 가속 배수에 (1 − 값)을 곱한다 (예: 0.1 = 10% 감소) */
  duelSpeedupCut?: number;
  /** 미끼가 할인율 (예: 0.25 = 25% 감소) */
  baitDiscount?: number;
  /** 돌연변이 확률 — 기본 MUTATION_RATE를 이 값으로 대체한다 (예: 1/3) */
  variantRate?: number;
}

export interface Artifact {
  id: string;
  name: string;
  zone: BountyZone;
  /** 유물 급 — 희귀가 기본이고, 낚시·결투 결과를 바꾸는 유물은 영웅이다 (일반은 평범해서 제외) */
  grade: RarityId;
  /** 교환 재료 — items 축 id/이름. 네임드 토벌 시 1개 지급, 교환 시 1개 소모 */
  materialId: string;
  materialName: string;
  lore: string;
  effects: ArtifactEffects;
}

export const ARTIFACTS: readonly Artifact[] = [
  // id는 세이브의 소유 목록·재료 스택이 참조하므로 개명 전 값을 유지한다
  { id: 'abyss-angler', name: '해구의 이빨', zone: 'pacific', grade: 'epic',
    materialId: 'mat-abyss-lantern', materialName: '돌이 된 이빨',
    lore: '해구 바닥에 돌처럼 쌓여 있던 거대한 이빨이다. 이 이빨을 지닌 배와 맞붙으면 깊은 곳의 것들도 더 큰 것을 떠올리고 몸을 사린다.',
    effects: { duelSpeedupCut: 0.1 } },
  { id: 'wreck-compass', name: '침선의 나침반', zone: 'seasia', grade: 'rare',
    materialId: 'mat-wreck-compass', materialName: '이끼 낀 나침반',
    lore: '코론 침선의 선실에서 건져 올린 나침반이다. 바다가 자리를 고쳐 누운 밤에도 바늘은 새로 열린 물길을 먼저 가리킨다.',
    effects: { sail: 0.1 } },
  { id: 'varuna-scale', name: '진주 상인의 저울', zone: 'indian', grade: 'rare',
    materialId: 'mat-varuna-weight', materialName: '녹슨 저울추',
    lore: '진주를 달던 상인들이 대를 물려 쓴 저울이다. 사원의 등잔 아래에서 눈금을 맞춘 뒤로, 올려놓은 것마다 값이 가벼워졌다고 한다.',
    effects: { baitDiscount: 0.25 } },
  { id: 'elder-scale', name: '코모로의 골판', zone: 'madagascar', grade: 'epic',
    materialId: 'mat-elder-scale', materialName: '깨진 골판',
    lore: '코모로 심해 바닥에서 떨어져 나온 골판 조각이다. 오래된 것이 아직 살아 있는 바다의 것이라, 지닌 자의 그물에는 남들과 다른 개체가 더 자주 걸린다.',
    effects: { variantRate: 1 / 3 } },   // 돌연변이:일반 = 1:2
];

const ARTIFACT_BY_ID = new Map(ARTIFACTS.map(a => [a.id, a]));

/** id → 유물. 없는 id는 undefined */
export const artifactById = (id: string): Artifact | undefined => ARTIFACT_BY_ID.get(id);

/** 해역의 유물 — 지역별 1개가 계약이라 없으면 undefined */
export const artifactOfZone = (zone: BountyZone): Artifact | undefined =>
  ARTIFACTS.find(a => a.zone === zone);
