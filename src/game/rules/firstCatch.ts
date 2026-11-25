// 마을 해역별 첫 경험 보장 — 해역별 상한 테이블 안에서 미보유 일반 폼 전종을 1회 이상 보장한다.
// 상한 테이블에 없는 해역에는 적용하지 않으며, 해역당 한 번이고 진척은 화면에 보이지 않는다.
// 리듀서 catch와 서버 fast path가 drawCatch를 거쳐 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { fishPool } from './logic.js';
import type { DayPhase } from './time.js';
import type { SpotId } from '../content/spots.js';
import type { Fish } from '../content/fish.js';

const SPOT_CAPS = {
  pond: 20,
  river: 30,
} as const satisfies Partial<Record<SpotId, number>>;

/** 보장 대상 해역 — 상한 테이블에 등록된 해역 각각에 독립 적용 */
export const FIRST_CATCH_SPOTS = Object.keys(SPOT_CAPS) as FirstCatchSpotId[];
export type FirstCatchSpotId = keyof typeof SPOT_CAPS;

/** 해역별 첫 경험 보장 캐치 횟수 상한 테이블 */
export const FIRST_CATCH_SPOT_CAPS: Partial<Record<SpotId, number>> = SPOT_CAPS;

export interface FirstCatchSpot {
  /** 보장이 진행되는 동안 센 해당 해역 캐치 수. 끝나면 더 세지 않는다 */
  n: number;
  /** 이 해역의 첫 경험 보장이 아직 진행 중인가 (false면 재활성화하지 않는다) */
  active: boolean;
}

export type FirstCatch = Record<FirstCatchSpotId, FirstCatchSpot>;

export const isFirstCatchSpot = (spot: SpotId): spot is FirstCatchSpotId => Object.hasOwn(SPOT_CAPS, spot);

export const newFirstCatchSpot = (): FirstCatchSpot => ({ n: 0, active: true });
export const endedFirstCatchSpot = (): FirstCatchSpot => ({ n: 0, active: false });

export const newFirstCatch = (): FirstCatch =>
  Object.fromEntries(FIRST_CATCH_SPOTS.map(s => [s, newFirstCatchSpot()])) as FirstCatch;

export const endedFirstCatch = (): FirstCatch =>
  Object.fromEntries(FIRST_CATCH_SPOTS.map(s => [s, endedFirstCatchSpot()])) as FirstCatch;

export const hasPendingFirstCatch = (fc: FirstCatch): boolean =>
  FIRST_CATCH_SPOTS.some(s => fc[s].active);

/** 필드가 없는 이전 세이브의 판정 — 캐치가 하나도 없는 계정(도감이 비고 명성 0)만 보장 대상이다.
 *  명성은 줄지 않고 캐치로만 쌓이므로, 도감을 들고 있지 않은 서버 경로도 같은 판정을 한다 */
export const firstCatchOfLegacy = (dexCatches: number, fame: number): FirstCatch =>
  dexCatches === 0 && fame === 0 ? newFirstCatch() : endedFirstCatch();

/** 구 단일 객체 형식이면서 진행 중이라 전체 도감(마을 강 어획 여부)으로 이관 판정이 필요한가 */
export function needsLegacyFirstCatchMigration(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (FIRST_CATCH_SPOTS.some(s => Object.hasOwn(r, s))) return false;
  const int = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1_000_000;
  return int(r.n) && int(r.legendAt) && typeof r.epic === 'boolean' && typeof r.legend === 'boolean'
    && (r.epic || r.legend);
}

/** 이번 캐치(해당 해역 n+1번째)가 보장 대상이면 그 해역·시간대 풀에서 미보유 일반 폼 어종을 고른다.
 *  상한 테이블에 없거나 비활성이거나 상한에 도달했거나 모든 어종 일반 폼을 보유하면 null.
 *  남은 보장 횟수(cap - n)가 미보유 어종 수 이하일 때는 반드시 미보유 어종 중 하나를 고르고,
 *  여유 구간에서는 진행률 체크포인트(floor((n+1)*total/cap))보다 보유 종 수가 뒤처질 때만 고른다.
 *  어종을 고를 때 rng를 한 번 쓴다(통상 추첨을 대신하는 자리) */
export function firstCatchTarget(
  fc: FirstCatch,
  spot: SpotId,
  phase: DayPhase,
  ownsNormal: (fishId: string) => boolean,
  rng: () => number,
): Fish | null {
  const cap = FIRST_CATCH_SPOT_CAPS[spot];
  if (cap === undefined || !isFirstCatchSpot(spot)) return null;
  const s = fc[spot];
  if (!s.active || s.n >= cap) return null;
  const pool = fishPool(spot, phase);
  const missing = pool.filter(f => !ownsNormal(f.id));
  if (missing.length === 0) return null;
  const rem = cap - s.n;
  const no = s.n + 1;
  const owned = pool.length - missing.length;
  const targetOwned = Math.floor((no * pool.length) / cap);
  if (rem > missing.length && owned >= targetOwned) return null;
  return missing[Math.floor(rng() * missing.length)];
}

/** 캐치 결과 반영 — 대상 해역 카운트만 올리고, 상한에 도달하거나 모든 어종 일반 폼을 보유하면 그 해역의 보장을 닫는다.
 *  다른 해역 상태는 건드리지 않는다. */
export function settleFirstCatch(
  fc: FirstCatch,
  spot: SpotId,
  ownsNormalAfter: (fishId: string) => boolean,
): FirstCatch {
  const cap = FIRST_CATCH_SPOT_CAPS[spot];
  if (cap === undefined || !isFirstCatchSpot(spot)) return fc;
  const s = fc[spot];
  if (!s.active) return fc;
  const nextN = s.n + 1;
  const allOwned = fishPool(spot, 'night').every(f => ownsNormalAfter(f.id));
  const nextSpot: FirstCatchSpot = nextN >= cap || allOwned
    ? endedFirstCatchSpot()
    : { n: nextN, active: true };
  return { ...fc, [spot]: nextSpot };
}
