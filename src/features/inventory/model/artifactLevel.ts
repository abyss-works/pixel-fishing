import { ARTIFACT_MAX_LEVEL, artifactHasLevel, artifactLevelCost } from '../../../game/content/artifacts';
import type { Artifact, ArtifactEffects } from '../../../game/content/artifacts';
import { artifactEffectsAt, artifactLevelOf } from '../../../game/rules/artifactLevel';
import type { GameState } from '../../../game/rules/logic';

/** 강화 버튼의 상태 - unowned 갖지 않음, legendary 레벨 없음, max 최고 레벨, short 재료 부족, ready 강화할 수 있음 */
export type ArtifactLevelStatus = 'unowned' | 'legendary' | 'max' | 'short' | 'ready';

export interface ArtifactLevelView {
  artifact: Artifact;
  status: ArtifactLevelStatus;
  /** 레벨이 있는 유물인가 - 전설 유물은 레벨 줄을 내지 않는다 */
  hasLevel: boolean;
  /** 보유 레벨. 갖지 않았으면 0, 전설 유물은 1 */
  level: number;
  /** 지금 레벨의 효과 - 갖지 않았으면 Lv1 기준(교환하면 받는 효과) */
  effects: ArtifactEffects;
  /** 교환 재료와 보유 수 - 강화에도 같은 재료를 쓴다 */
  material: { name: string; have: number };
  /** 다음 레벨 - 강화할 수 있는 레벨 유물만 있다(재료가 모자라도 보인다) */
  next: { level: number; cost: number; effects: ArtifactEffects } | null;
}

/** 유물 상세 창이 쓰는 레벨 데이터. 레벨 판정은 game 규칙(artifactLevelOf, 비용, 최고 레벨)을 그대로 따른다 */
export function selectArtifactLevel(game: Pick<GameState, 'artifacts' | 'artifactLevels' | 'items'>, artifact: Artifact): ArtifactLevelView {
  const hasLevel = artifactHasLevel(artifact);
  const level = artifactLevelOf(game, artifact.id);
  const have = game.items[artifact.materialId] ?? 0;
  const base = {
    artifact, hasLevel, level,
    effects: artifactEffectsAt(artifact, Math.max(1, level)),
    material: { name: artifact.materialName, have },
  };
  if (level === 0) return { ...base, status: 'unowned', next: null };
  if (!hasLevel) return { ...base, status: 'legendary', next: null };
  if (level >= ARTIFACT_MAX_LEVEL) return { ...base, status: 'max', next: null };
  const cost = artifactLevelCost(level + 1);
  return {
    ...base, status: have >= cost ? 'ready' : 'short',
    next: { level: level + 1, cost, effects: artifactEffectsAt(artifact, level + 1) },
  };
}

/** 강화에 쓰는 문구 - 거부 문구는 상태별로, 레벨 줄과 재료 줄의 툴팁은 화면이 가져다 쓴다 */
export const LEVEL_UP_TEXT = {
  button: '강화',
  maxButton: '최고 레벨',
  materialLabel: '필요한 재료',
  materialTip: '교환 재료는 네임드 토벌 보상으로 받아요. 강화에도 같은 재료를 써요.',
  /** 강화를 보낼 수 없는 상태별 거부 문구 */
  notice: {
    unowned: '아직 가지지 않은 유물이에요. 먼저 교환해 주세요.',
    legendary: '전설 유물은 레벨이 없어요. 가지고만 있어도 효과가 계속돼요.',
    max: '이미 최고 레벨이에요.',
    short: '교환 재료가 부족해요. 네임드를 토벌해 보세요.',
  },
} as const;

/** 레벨 값 문구 */
export const levelText = (level: number): string => `Lv.${level}`;

/** 강화 성공 토스트 */
export const levelUpToast = (artifact: Pick<Artifact, 'name'>, level: number): string =>
  `${artifact.name}의 레벨이 ${levelText(level)}까지 올랐어요!`;
