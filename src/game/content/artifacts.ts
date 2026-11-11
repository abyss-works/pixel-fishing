// 유물 레지스트리 — 네임드마다 하나씩 제공한다.
// 유물은 네임드 토벌로 얻은 교환 재료(수치는 items 축)로 맞바꾼 영구 소유물이다.
// 슬롯·장착이 없어 소유 목록(state.artifacts)이 곧 효과다. 효과 수치는 data에 두고
// 문장(로어·효과 설명)에는 손으로 숫자를 적지 않는다 — UI가 data에서 뽑는다.
// 행 추가 = 여기 1행 (무결성은 artifacts.test가 자동 검증).
import type { RarityId } from './rarity.js';
import type { FormId } from './fish.js';
import type { BountyZone } from './bounties.js';

export interface ArtifactEffects {
  /** 항해 속도 가산율 (예: 0.03 = +3%) */
  sail?: number;
  /** 네임드 결투 가속 단위 감소율 — 가속 배수에 (1 − 값)을 곱한다 (예: 0.1 = 10% 감소) */
  duelSpeedupCut?: number;
  /** 미끼가 할인율 (예: 0.25 = 25% 감소) */
  baitDiscount?: number;
  /** 입질 대기 감소율 — 유효 입질 대기(최소·최대)에 (1 − 값)을 곱한다 (예: 0.1 = 10% 감소) */
  biteWaitCut?: number;
  /** 폼 가중치 — 전역 기본 가중치(돌연변이 1 : 일반 3) 기준 Lv1 값이다. 돌연변이 가중치가 기본보다 올린 몫(여기서는 +25%)이
   *  레벨 계수로 커진다. 이 유물을 가지면 해역의 폼 가중치 오버라이드는 무시하고, 전역 기본 가중치의 돌연변이 쪽에 그 비율을 곱해 쓴다 */
  mutationWeight?: Record<FormId, number>;
}

/** 요리 효과 — 조리 규칙이 읽는 유물 효과. 값은 Lv1 기준이고 레벨 계수가 곱해진다 */
export interface ArtifactCookEffects {
  /** 요리를 조리할 때 1개마다 하나 더 완성될 확률 (예: 0.1 = 10%) */
  extraCookChance: number;
}

/** 전설 유물의 고정 효과 — 레벨이 없고 보너스와 페널티가 함께 적용된다 */
export interface ArtifactSystemEffects {
  /** 네임드 토벌 하루 상한 가산 (예: 1 = +1회) */
  namedCapBonus: number;
  /** 네임드 토벌 골드 보상 감소율 — 골드에만 붙고 교환 재료 수는 그대로다 (예: 0.3 = 30% 감소) */
  namedRewardCut: number;
}

/** 유물 최고 레벨 — 희귀와 영웅 유물이 Lv1에서 여기까지 오른다 */
export const ARTIFACT_MAX_LEVEL = 5;
/** 레벨 계수 — 인덱스 0이 Lv1. Lv1 효과(또는 효과가 더해 주는 몫)에 곱한다 */
export const ARTIFACT_LEVEL_COEF: readonly number[] = [1, 1.25, 1.5, 1.75, 2];
/** 그 레벨로 올릴 때 드는 교환 재료 수 (Lv2부터 1, 2, 4, 8) */
export const artifactLevelCost = (toLevel: number): number => 2 ** (toLevel - 2);

export interface Artifact {
  id: string;
  name: string;
  zone: BountyZone;
  /** 이 유물을 주는 네임드 id — 네임드마다 유물이 하나다 */
  namedId: string;
  /** 유물 급 — 희귀가 기본이고, 낚시·결투 결과를 바꾸는 유물은 영웅, 시스템을 바꾸는 유물은 전설이다 (일반은 두지 않는다) */
  grade: RarityId;
  /** 교환 재료 — items 축 id/이름. 네임드 토벌 시 1개 지급, 교환 시 1개 소모 */
  materialId: string;
  materialName: string;
  lore: string;
  effects: ArtifactEffects;
  /** 요리 효과 — 요리 규칙이 읽는다. 없으면 요리에 영향이 없다 */
  cook?: ArtifactCookEffects;
  /** 전설 유물의 고정 효과 — 전설만 둔다 */
  system?: ArtifactSystemEffects;
}

/** 레벨이 있는 유물인가 — 희귀와 영웅만 레벨이 있고 전설은 효과가 고정이다 */
export const artifactHasLevel = (a: Pick<Artifact, 'grade'>): boolean => a.grade !== 'legendary';

export const ARTIFACTS: readonly Artifact[] = [
  // id는 세이브의 소유 목록·재료 스택이 참조하므로 개명 전 값을 유지한다
  { id: 'abyss-angler', namedId: 'megalodon', name: '해구의 이빨', zone: 'pacific', grade: 'epic',
    materialId: 'mat-abyss-lantern', materialName: '돌이 된 이빨',
    lore: '해구 바닥에 돌처럼 쌓여 있던 거대한 이빨이다. 이 이빨을 지닌 배와 맞붙으면 깊은 곳의 것들도 더 큰 것을 떠올리고 몸을 사린다.',
    effects: { duelSpeedupCut: 0.1 } },
  { id: 'wreck-compass', namedId: 'leviathan', name: '침선의 나침반', zone: 'seasia', grade: 'rare',
    materialId: 'mat-wreck-compass', materialName: '이끼 낀 나침반',
    lore: '코론 침선의 선실에서 건져 올린 나침반이다. 바다가 자리를 고쳐 누운 밤에도 바늘은 새로 열린 물길을 먼저 가리킨다.',
    effects: { sail: 0.1 } },
  { id: 'varuna-scale', namedId: 'ananta', name: '진주 상인의 저울', zone: 'indian', grade: 'rare',
    materialId: 'mat-varuna-weight', materialName: '녹슨 저울추',
    lore: '진주를 달던 상인들이 대를 물려 쓴 저울이다. 사원의 등잔 아래에서 눈금을 맞춘 뒤로, 올려놓은 것마다 값이 가벼워졌다고 한다.',
    effects: {}, cook: { extraCookChance: 0.1 } },
  { id: 'elder-scale', namedId: 'elder-sixgill', name: '코모로의 골판', zone: 'madagascar', grade: 'epic',
    materialId: 'mat-elder-scale', materialName: '깨진 골판',
    lore: '코모로 심해 바닥에서 떨어져 나온 골판 조각이다. 오래된 것이 아직 살아 있는 바다의 것이라, 지닌 자의 그물에는 남들과 다른 개체가 더 자주 걸린다.',
    effects: { mutationWeight: { variant: 1.25, normal: 3 } } },
  { id: 'mami-wata-mirror', namedId: 'adamastor', name: '마미 와타의 거울', zone: 'southatlantic', grade: 'legendary',
    materialId: 'mat-clouded-mirror', materialName: '흐려진 손거울',
    lore: '이 손거울을 월비스베이항 어부들은 물의 여인 마미 와타의 거울이라 부른다. 거울을 뱃머리에 건 배는 같은 날 거울에 비친 물길을 따라 다시 나간다. 그 배의 선주는 수배판에서 받은 값을 조금 떼어 뱃전 너머로 던진다.',
    effects: {}, system: { namedCapBonus: 1, namedRewardCut: 0.3 } },
  { id: 'outer-isle-sinker', namedId: 'jasconius', name: '바깥섬의 봉돌', zone: 'southatlantic', grade: 'rare',
    materialId: 'mat-scorched-sinker', materialName: '그을린 봉돌',
    lore: '바깥섬 등의 그을린 자리에서 떼어 낸 돌을 깎아 만든 봉돌이다. 섬의 낚시꾼들은 이 봉돌을 단 줄 아래로 물고기들이 바깥섬 그늘을 찾아가듯 금세 모여든다고 한다.',
    effects: { biteWaitCut: 0.1 } },
];

const ARTIFACT_BY_ID = new Map(ARTIFACTS.map(a => [a.id, a]));

/** id → 유물. 없는 id는 undefined */
export const artifactById = (id: string): Artifact | undefined => ARTIFACT_BY_ID.get(id);

/** 네임드의 유물 — 네임드마다 하나다. 없는 id는 undefined */
export const artifactOfNamed = (namedId: string): Artifact | undefined =>
  ARTIFACTS.find(a => a.namedId === namedId);

/** 해역의 유물 목록 — 그 해역 네임드의 유물이 레지스트리 순서로 나온다 */
export const artifactsOfZone = (zone: BountyZone): Artifact[] =>
  ARTIFACTS.filter(a => a.zone === zone);
