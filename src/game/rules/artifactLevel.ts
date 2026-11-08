// 유물 레벨과 레벨 적용 효과 — 유물 효과를 읽는 모든 규칙이 이 모듈의 함수를 거친다.
// 레벨은 보유 목록과 따로 유물 id별 맵(artifactLevels)에 있고, 값이 없으면 Lv1이다.
import {
  ARTIFACTS, ARTIFACT_LEVEL_COEF, ARTIFACT_MAX_LEVEL, artifactById, artifactHasLevel,
} from '../content/artifacts.js';
import type { Artifact, ArtifactEffects } from '../content/artifacts.js';
import type { BountyKind } from '../content/bounties.js';
import { MUTATION_WEIGHTS, bountyDailyCap } from './balance.js';
import type { GameState } from './logic.js';

/** 유물 레벨을 읽는 데 필요한 상태 */
export type ArtifactHolder = Pick<GameState, 'artifacts' | 'artifactLevels'>;

/** 보유 유물의 현재 레벨 — 갖지 않았으면 0, 레벨이 없는 유물(전설)과 맵에 값이 없는 유물은 1.
 *  저장된 값이 범위 밖이어도 1~최고 레벨로 접는다 */
export function artifactLevelOf(state: ArtifactHolder, id: string): number {
  if (!state.artifacts.includes(id)) return 0;
  const art = artifactById(id);
  if (!art || !artifactHasLevel(art)) return 1;
  const stored = state.artifactLevels?.[id];
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return 1;
  return Math.min(ARTIFACT_MAX_LEVEL, Math.max(1, Math.floor(stored)));
}

/** 부동소수 오차를 걷어 낸다 — 0.1 × 1.5가 0.15000000000000002로 나오지 않게 한다 */
const clean = (x: number): number => Math.round(x * 1e9) / 1e9;

const coefOf = (level: number): number =>
  ARTIFACT_LEVEL_COEF[Math.min(ARTIFACT_MAX_LEVEL, Math.max(1, Math.floor(level))) - 1];

/** 그 레벨에서의 효과 — Lv1 효과에 레벨 계수를 곱한다. 비율을 바꾸는 효과(폼 가중치)는 기본보다 올린 몫에 곱한다.
 *  레벨이 없는 유물은 레벨과 무관하게 Lv1 효과다 */
export function artifactEffectsAt(art: Artifact, level: number): ArtifactEffects {
  const k = artifactHasLevel(art) ? coefOf(level) : 1;
  const e = art.effects;
  const out: ArtifactEffects = {};
  if (e.sail !== undefined) out.sail = clean(e.sail * k);
  if (e.duelSpeedupCut !== undefined) out.duelSpeedupCut = clean(e.duelSpeedupCut * k);
  if (e.baitDiscount !== undefined) out.baitDiscount = clean(e.baitDiscount * k);
  if (e.biteWaitCut !== undefined) out.biteWaitCut = clean(e.biteWaitCut * k);
  if (e.mutationWeight !== undefined) {
    const boost = e.mutationWeight.variant / MUTATION_WEIGHTS.variant - 1;
    out.mutationWeight = {
      variant: clean(MUTATION_WEIGHTS.variant * (1 + boost * k)), normal: e.mutationWeight.normal,
    };
  }
  return out;
}

/** 돌연변이 가중치 증가율 — 보유한 골판의 현재 레벨 기준. 없으면 0 */
export function variantBoostOf(state: ArtifactHolder): number {
  let boost = 0;
  for (const a of ARTIFACTS) {
    if (!a.effects.mutationWeight) continue;
    const level = artifactLevelOf(state, a.id);
    if (level === 0) continue;
    const w = artifactEffectsAt(a, level).mutationWeight!;
    boost = Math.max(boost, w.variant / MUTATION_WEIGHTS.variant - 1);
  }
  return boost;
}

/** 결투 가속 단위에 거는 유물 배수 — 보유 유물마다 (1 − 감소율)을 곱한다 */
export function duelSpeedupScale(state: ArtifactHolder): number {
  return ARTIFACTS.reduce((scale, a) => {
    const level = artifactLevelOf(state, a.id);
    if (level === 0) return scale;
    return scale * (1 - (artifactEffectsAt(a, level).duelSpeedupCut ?? 0));
  }, 1);
}

/** 네임드 토벌 하루 클리어 상한 — 기본 상한에 보유 전설 유물의 가산을 더한다 */
export function namedDailyCap(state: ArtifactHolder): number {
  return bountyDailyCap('named') + ARTIFACTS.reduce((sum, a) =>
    state.artifacts.includes(a.id) ? sum + (a.system?.namedCapBonus ?? 0) : sum, 0);
}

/** 갈래별 하루 클리어 상한 — 일반 의뢰는 유물의 영향을 받지 않는다 */
export function dailyClearCap(state: ArtifactHolder, kind: BountyKind): number {
  return kind === 'named' ? namedDailyCap(state) : bountyDailyCap(kind);
}

/** 네임드 토벌로 받는 골드 — 보유 전설 유물의 보상 감소를 적용한다. 교환 재료 수에는 영향이 없다 */
export function namedRewardOf(state: ArtifactHolder, reward: number): number {
  const cut = ARTIFACTS.reduce((sum, a) =>
    state.artifacts.includes(a.id) ? sum + (a.system?.namedRewardCut ?? 0) : sum, 0);
  return Math.floor(clean(reward * (1 - Math.min(1, cut))));
}
