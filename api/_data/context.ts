// 서버 계층 효과 묶음 생성기 — 서버 액션과 조회가 동일한 PlayerContext를 만든다.
import { createPlayerContext } from '../../src/game/rules/effects.js';
import type { AchievementBonuses, PlayerContext } from '../../src/game/rules/effects.js';
import type { GuildEffects } from '../../src/game/rules/guild.js';
import type { GameState } from '../../src/game/rules/logic.js';

/** 서버에서 상태·길드 효과·서버 시각·업적 보너스로 효과 묶음을 만든다 */
export function serverPlayerContext(
  state: GameState,
  guild: GuildEffects,
  now: string,
  achievements: AchievementBonuses,
): PlayerContext {
  return createPlayerContext({ state, guild, now, achievements });
}
