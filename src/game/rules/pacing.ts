// 캐치 간격 규칙 — 계정 하나의 캐치 속도는 낚시 한 사이클(획득 표시 → 입질 대기 → 챔질)보다 빠를 수 없다.
// 창을 여러 개 띄우거나 요청을 직접 보내도 계정 단위로 같은 상한이 걸린다. 서버 액션 처리기가 쓴다.
import { biteWaitOf, createPlayerContext } from './effects.js';
import { achievementBonusesOf } from './achievements.js';
import { NO_GUILD_EFFECTS } from './guild.js';
import type { GameState } from './logic.js';
import type { SpotId } from '../content/spots.js';
import { CATCH_MS, CATCH_MS_BY_RARITY, CATCH_PACING_SLACK_MS } from './balance.js';

/** 가장 짧은 획득 표시 시간 — 직전 캐치의 등급을 모르므로 가장 짧은 값을 기준으로 한다 */
export const MIN_CATCH_SHOW_MS = Math.min(CATCH_MS, ...Object.values(CATCH_MS_BY_RARITY));

/**
 * 직전 캐치 시각 대비 이번 캐치가 허용되기까지 남은 대기 시간(ms). 0이면 즉시 허용한다.
 * @param lastCatchAt 직전 캐치가 확정된 시각(ISO). 기록이 없거나 읽을 수 없으면 0을 반환한다.
 * @param now 이번 요청의 서버 시각(ISO)
 * 활성 도시락의 입질 대기 단축과 업적 누적 보너스(입질 대기 단축, 유물 배율)를 허용 간격에 넣는다(방치 사이클이 가장 짧다).
 */
export function catchWaitMs(state: GameState, spot: SpotId, lastCatchAt: string | null, now: string): number {
  const last = lastCatchAt === null ? NaN : Date.parse(lastCatchAt);
  if (!Number.isFinite(last)) return 0;
  const ctx = createPlayerContext({
    state,
    guild: NO_GUILD_EFFECTS,
    now,
    achievements: achievementBonusesOf(state),
  });
  const cycleMs = MIN_CATCH_SHOW_MS + biteWaitOf(ctx, spot, 'idle').min.value * 1000;
  return Math.max(0, cycleMs - CATCH_PACING_SLACK_MS - (Date.parse(now) - last));
}

/**
 * 직전 캐치 시각 대비 이번 캐치가 너무 이른지 판정한다.
 * @param lastCatchAt 직전 캐치가 확정된 시각(ISO). 기록이 없거나 읽을 수 없으면 막지 않는다.
 * @param now 이번 요청의 서버 시각(ISO)
 */
export function catchTooSoon(state: GameState, spot: SpotId, lastCatchAt: string | null, now: string): boolean {
  return catchWaitMs(state, spot, lastCatchAt, now) > 0;
}
