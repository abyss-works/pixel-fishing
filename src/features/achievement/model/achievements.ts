// 업적 창의 파생 모델 — 판정(진척, 수령 가능)은 게임 규칙의 순수 함수를 그대로 쓰고,
// 여기서는 화면이 읽을 값(요약 줄, 탭 목록, 행 상태)으로 묶는다.
import { ACHIEVEMENTS, achievementForHatId } from '../../../game/content/achievements';
import type { AchievementDef, AchievementTab } from '../../../game/content/achievements';
import { achievementProgress } from '../../../game/rules/achievements';
import { canClaimAchievement, canClaimAllAchievements } from '../../../game/rules/rules';
import type { GameState } from '../../../game/rules/logic';

/** 업적 창 탭 — 정의 순서(progress, collection, namedArtifact, count)가 탭 순서다 */
export const ACHIEVEMENT_TABS: { key: AchievementTab; label: string }[] = [
  { key: 'progress', label: '진행' },
  { key: 'collection', label: '수집' },
  { key: 'namedArtifact', label: '네임드와 유물' },
  { key: 'count', label: '횟수' },
];

export type AchievementRowStatus = 'progress' | 'claimable' | 'claimed';

export interface AchievementRow {
  def: AchievementDef;
  /** 진행 중: 조건을 채우지 못했다. claimable: 받을 수 있다. claimed: 받았다 */
  status: AchievementRowStatus;
  /** 진척 — 현재 / 목표. 진척은 숫자로만 보인다(미발견 실명을 드러내지 않는다) */
  progress: { current: number; target: number };
}

/** 행 상태 — claimed이면 받음, claimable이면 받을 수 있음, 그 밖은 진행 중 */
export function rowStatusOf(game: GameState, id: string): AchievementRowStatus {
  const stored = game.achievements[id];
  if (stored === 'claimed') return 'claimed';
  if (stored === 'claimable') return 'claimable';
  return 'progress';
}

/** 한 업적의 행 값. 진척은 규칙의 순수 판정에서 온다 */
export function achievementRow(game: GameState, def: AchievementDef): AchievementRow {
  const p = achievementProgress(game, def.id);
  return { def, status: rowStatusOf(game, def.id), progress: { current: p.current, target: p.target } };
}

/** id로 행을 만든다. 모르는 id면 undefined다 */
export function achievementRowById(game: GameState, id: string): AchievementRow | undefined {
  const def = ACHIEVEMENTS.find(a => a.id === id);
  return def ? achievementRow(game, def) : undefined;
}

const ORDER: Record<AchievementRowStatus, number> = { claimable: 0, progress: 1, claimed: 2 };

/** 한 탭의 행 목록 — claimable을 맨 위에, 그 아래 진행 중, 마지막에 받은 순이다 */
export function achievementRows(game: GameState, tab: AchievementTab): AchievementRow[] {
  return ACHIEVEMENTS.filter(a => a.tab === tab)
    .map(a => achievementRow(game, a))
    .sort((x, y) => ORDER[x.status] - ORDER[y.status]);
}

/** 받을 수 있는 업적의 수 — 메뉴 줄 배지와 요약 줄이 같은 값을 쓴다 */
export function claimableCount(game: GameState): number {
  return ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimable').length;
}

/**
 * 액션 확정 뒤 새로 받을 수 있게 된 업적의 이름표 — 메시지 창 한 줄 알림의 재료다.
 * 이전 상태에서 claimable이 아니었던 업적이 새 상태에서 claimable이면 뽑는다
 * (이미 claimable이거나 받기로 바뀐 것은 새 업적이 아니다). 모르는 id는 이름표를 지어내지 않는다.
 */
export function newlyClaimable(before: GameState, after: GameState): string[] {
  return ACHIEVEMENTS.filter(a => after.achievements[a.id] === 'claimable' && before.achievements[a.id] !== 'claimable')
    .map(a => a.name);
}

/** 상단 요약 줄 — 받은 수, 받을 골드 합, 받을 모자 수, 모두 받기 가능 여부 */
export function achievementSummary(game: GameState, guest = false): {
  claimed: number;
  total: number;
  gold: number;
  hats: number;
  canClaimAll: boolean;
} {
  let gold = 0;
  let hats = 0;
  for (const a of ACHIEVEMENTS) {
    if (game.achievements[a.id] !== 'claimable') continue;
    if (a.reward.kind === 'gold') gold += a.reward.gold;
    else hats += 1;
  }
  return {
    claimed: ACHIEVEMENTS.filter(a => game.achievements[a.id] === 'claimed').length,
    total: ACHIEVEMENTS.length,
    gold,
    hats,
    canClaimAll: canClaimAllAchievements(game, guest).ok,
  };
}

/** 행의 받기 버튼 가능 여부 — 규칙의 수령 판정을 그대로 쓴다 */
export function canClaim(game: GameState, id: string, guest = false): boolean {
  return canClaimAchievement(game, id, guest).ok;
}

/** 모자 칸의 해금 업적 — 업적 모자면 그 업적, 골드 모자면 undefined */
export const achievementForHat = achievementForHatId;
