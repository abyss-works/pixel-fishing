// 밸런스 도구 계층 효과 묶음 생성기 — 시뮬레이션 시나리오가 게임 규칙과 동일한 PlayerContext를 쓴다.
import { createPlayerContext } from '../../src/game/rules/effects';
import type { AchievementBonuses, PlayerContext } from '../../src/game/rules/effects';
import type { GuildEffects } from '../../src/game/rules/guild';
import type { GameState } from '../../src/game/rules/logic';

/** 도구 시나리오에서 상태·길드 효과·기준 시각·업적 보너스로 효과 묶음을 만든다 */
export function toolPlayerContext(
  state: GameState,
  guild: GuildEffects,
  now: string,
  achievements: AchievementBonuses,
): PlayerContext {
  return createPlayerContext({ state, guild, now, achievements });
}
