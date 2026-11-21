// 클라이언트 계층 효과 묶음 훅 — 화면 선택자가 동일한 PlayerContext를 공유한다.
import { useMemo } from 'react';
import { createPlayerContext } from '../../../game/rules/effects';
import type { AchievementBonuses, PlayerContext } from '../../../game/rules/effects';
import type { GuildEffects } from '../../../game/rules/guild';
import type { GameState } from '../../../game/rules/logic';

/** 게임 상태·길드 효과·기준 시각·업적 보너스로 메모이즈된 효과 묶음을 만든다 */
export function usePlayerContext(
  game: GameState,
  guild: GuildEffects,
  now: string,
  achievements: AchievementBonuses,
): PlayerContext {
  return useMemo(
    () => createPlayerContext({ state: game, guild, now, achievements }),
    [game, guild, now, achievements],
  );
}
