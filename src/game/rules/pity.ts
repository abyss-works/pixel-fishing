// 천장 순수 규칙 — 운이 오래 빗나간 플레이어에게 결과를 보장한다. 진척은 화면에 보이지 않는다.
//  - 어종 천장: 어종마다 일반 폼을 처음 잡을 때까지만 작동한다. 캐치마다 그 어종 일반 폼이 나올 확률을
//    쌓고(확률 질량), 합이 K에 닿으면 그 어종을 확정한다. 방치·수동·미끼·시간대가 확률에 그대로 들어가므로
//    어떤 플레이 방식이든 천장 전 미획득 확률이 e^−K 이하로 묶인다. 초기화하지 않는다.
//  - 네임드 조우 천장: 조우 후보가 있는 캐치의 빗나감을 세고, 하루(게임 날짜)의 천장 번째 캐치에서 조우를 확정한다.
//    결투에 실패하면 그날 다음 천장을 절반으로 줄인다(두 번까지). 게임 날짜가 바뀌면 모두 초기화한다.
// 리듀서 catch와 서버 fast path가 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { fishDrawShares, fishPool, namedEncounterCandidates, rollNamedEncounter } from './logic.js';
import type { DrawOptions, FormId } from './logic.js';
import { gameDayOf } from './time.js';
import type { DayPhase } from './time.js';
import type { SpotId } from '../content/spots.js';
import type { BountyQuest } from '../content/bounties.js';

/** 어종 천장 상수 — 기대 시행의 3배(운 나쁜 하위 5%를 자른다) */
export const SPECIES_PITY_K = 3;
/** 끝난 어종 표시 — 일반 폼을 가졌으므로 더 쌓지 않는다 */
export const PITY_DONE = -1;
/** 어종 → 누적 확률 질량(또는 PITY_DONE) */
export type SpeciesPity = Record<string, number>;

/** 이번 캐치에서 천장으로 확정할 수 있는 후보 — 지금 풀에 있고 누적이 K 이상인 미완료 어종, 누적 큰 순 */
export function speciesPityCandidates(pity: SpeciesPity, spot: SpotId, phase: DayPhase): string[] {
  return fishPool(spot, phase)
    .filter(f => (pity[f.id] ?? 0) >= SPECIES_PITY_K)
    .sort((a, b) => pity[b.id] - pity[a.id])
    .map(f => f.id);
}

/** 후보의 소유 여부를 반영해 확정 대상을 고른다 — 이미 일반 폼을 가진 후보는 끝 표시한다 */
export function resolveSpeciesPity(
  pity: SpeciesPity, candidates: readonly string[], ownsNormal: (fishId: string) => boolean,
): { pity: SpeciesPity; target: string | null } {
  const next = { ...pity };
  let target: string | null = null;
  for (const id of candidates) {
    if (ownsNormal(id)) next[id] = PITY_DONE;
    else target ??= id;
  }
  return { pity: next, target };
}

/** 이번 캐치의 분포로 각 어종 일반 폼이 나올 확률을 더한다. opts는 실제 추첨과 같은 다이얼이다 */
export function accrueSpeciesPity(
  pity: SpeciesPity, spot: SpotId, opts: DrawOptions, normalShare: number,
): SpeciesPity {
  const next = { ...pity };
  for (const { fish, share } of fishDrawShares(spot, opts)) {
    const cur = next[fish.id] ?? 0;
    if (cur === PITY_DONE) continue;
    next[fish.id] = cur + share * normalShare;
  }
  return next;
}

/** 잡은 결과 반영 — 일반 폼이면 그 어종의 천장이 끝난다 */
export function settleSpeciesPity(pity: SpeciesPity, fishId: string, form: FormId): SpeciesPity {
  return form === 'normal' ? { ...pity, [fishId]: PITY_DONE } : pity;
}

/** 네임드 조우 천장 상수 — 조우 확률 1/1000에서 운 나쁜 하위 20%를 자르는 캐치 수 */
export const NAMED_PITY_CATCHES = 1609;
/** 결투 실패로 천장을 줄이는 최대 횟수 */
export const NAMED_PITY_MAX_RELIEF = 2;

export interface NamedPity {
  day: string;    // 게임 날짜 — 바뀌면 아래 값이 초기화된다
  misses: number; // 마지막 조우 뒤 후보가 있었던 캐치의 빗나감 수
  fails: number;  // 그날 결투 실패 수
}
export const newNamedPity = (): NamedPity => ({ day: '', misses: 0, fails: 0 });

/** 그날 결투 실패 수에 따른 천장 — 실패마다 절반, 두 번까지 */
export function namedPityCeiling(fails: number): number {
  return Math.round(NAMED_PITY_CATCHES / 2 ** Math.min(fails, NAMED_PITY_MAX_RELIEF));
}

const onDay = (p: NamedPity, nowIso: string): NamedPity => {
  const day = gameDayOf(nowIso);
  return p.day === day ? p : { day, misses: 0, fails: 0 };
};

/** 네임드 조우 추첨 + 천장. 천장에 닿으면 조우 게이트를 강제로 통과시킨다(rng 소비 횟수는 같다) */
export function drawNamedEncounter(
  p: NamedPity, activeIds: readonly string[], spot: SpotId, nowIso: string,
  rng: () => number = Math.random, force = false,
): { quest: BountyQuest | null; pity: NamedPity; byCeiling: boolean } {
  const cur = onDay(p, nowIso);
  if (namedEncounterCandidates(activeIds, spot).length === 0) return { quest: null, pity: cur, byCeiling: false };
  const byCeiling = cur.misses + 1 >= namedPityCeiling(cur.fails);
  const quest = rollNamedEncounter(activeIds, spot, rng, force || byCeiling);
  return quest
    ? { quest, pity: { ...cur, misses: 0 }, byCeiling: byCeiling && !force }
    : { quest: null, pity: { ...cur, misses: cur.misses + 1 }, byCeiling: false };
}

/** 결투 실패 반영 — 그날 다음 조우의 천장이 줄어든다 */
export function recordDuelFailure(p: NamedPity, nowIso: string): NamedPity {
  const cur = onDay(p, nowIso);
  return { ...cur, fails: cur.fails + 1 };
}
