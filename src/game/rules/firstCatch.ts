// 마을 해역별 첫 경험 보장 — 마을 연못·마을 강 각각 5번째 캐치에서 영웅 한 마리,
// 서버가 해역마다 한 번 정한 10~15번째 캐치에서 전설 한 마리를 잡게 한다.
// 바다 해역에는 적용하지 않으며, 해역당 한 번이고 진척은 화면에 보이지 않는다.
// 리듀서 catch와 서버 fast path가 drawCatch를 거쳐 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { fishPool } from './logic.js';
import type { DayPhase } from './time.js';
import type { SpotId } from '../content/spots.js';
import type { Fish } from '../content/fish.js';

/** 보장 대상 해역 — 마을 두 해역 각각에 독립 적용 */
export const FIRST_CATCH_SPOTS = ['pond', 'river'] as const;
export type FirstCatchSpotId = (typeof FIRST_CATCH_SPOTS)[number];

/** 영웅이 나오는 해역 캐치 번호 */
export const FIRST_CATCH_EPIC_AT = 5;
/** 전설이 나오는 해역 캐치 번호의 범위(양끝 포함) */
export const FIRST_CATCH_LEGEND_MIN = 10;
export const FIRST_CATCH_LEGEND_MAX = 15;

export interface FirstCatchSpot {
  /** 보장이 진행되는 동안 센 해당 해역 캐치 수. 끝나면 더 세지 않는다 */
  n: number;
  /** 전설이 나올 캐치 번호. 0 = 아직 정하지 않음(해당 해역의 첫 캐치에서 서버가 정한다) */
  legendAt: number;
  /** 영웅 보장이 남았는가 */
  epic: boolean;
  /** 전설 보장이 남았는가 */
  legend: boolean;
}

export interface FirstCatch {
  pond: FirstCatchSpot;
  river: FirstCatchSpot;
}

export const isFirstCatchSpot = (spot: SpotId): spot is FirstCatchSpotId => spot === 'pond' || spot === 'river';

export const newFirstCatchSpot = (): FirstCatchSpot => ({ n: 0, legendAt: 0, epic: true, legend: true });
export const endedFirstCatchSpot = (): FirstCatchSpot => ({ n: 0, legendAt: 0, epic: false, legend: false });
export const newFirstCatch = (): FirstCatch => ({ pond: newFirstCatchSpot(), river: newFirstCatchSpot() });
export const endedFirstCatch = (): FirstCatch => ({ pond: endedFirstCatchSpot(), river: endedFirstCatchSpot() });
export const hasPendingFirstCatch = (fc: FirstCatch): boolean =>
  FIRST_CATCH_SPOTS.some(s => fc[s].epic || fc[s].legend);
export const fixedFirstCatch = (legendAt: number): FirstCatch => ({
  pond: { n: 0, legendAt, epic: true, legend: true },
  river: { n: 0, legendAt, epic: true, legend: true },
});

/** 필드가 없는 이전 세이브의 판정 — 캐치가 하나도 없는 계정(도감이 비고 명성 0)만 보장 대상이다.
 *  명성은 줄지 않고 캐치로만 쌓이므로, 도감을 들고 있지 않은 서버 경로도 같은 판정을 한다 */
export const firstCatchOfLegacy = (dexCatches: number, fame: number): FirstCatch =>
  dexCatches === 0 && fame === 0 ? newFirstCatch() : endedFirstCatch();

/** 이번 캐치(해당 해역 n+1번째)가 보장 대상이면 그 마을 해역·시간대 풀에서 해당 등급 어종을 고른다.
 *  바다 등 비대상 해역이거나 풀에 그 등급 어종이 없으면 null.
 *  전설 번호가 지나도록 못 받았으면 번호를 넘긴 첫 가능한 캐치에서 받는다. 전설을 먼저 본다.
 *  어종을 고를 때 rng를 한 번 쓴다(통상 추첨을 대신하는 자리) */
export function firstCatchTarget(fc: FirstCatch, spot: SpotId, phase: DayPhase, rng: () => number): Fish | null {
  if (!isFirstCatchSpot(spot)) return null;
  const s = fc[spot];
  const no = s.n + 1;
  const due = [
    ...(s.legend && s.legendAt > 0 && no >= s.legendAt ? ['legendary' as const] : []),
    ...(s.epic && no >= FIRST_CATCH_EPIC_AT ? ['epic' as const] : []),
  ];
  for (const rarity of due) {
    const pool = fishPool(spot, phase).filter(f => f.rarity === rarity);
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)];
  }
  return null;
}

/** 캐치 결과 반영 — 대상 마을 해역의 수만 올리고, 해당 해역 첫 캐치에서 전설 번호를 정하며,
 *  보장으로 잡은 등급의 몫만 닫는다. 다른 마을 해역 상태는 건드리지 않는다.
 *  @param guaranteed 이번 캐치가 보장으로 고정된 어종이면 그 어종, 아니면 null */
export function settleFirstCatch(fc: FirstCatch, spot: SpotId, guaranteed: Fish | null, rng: () => number): FirstCatch {
  if (!isFirstCatchSpot(spot)) return fc;
  const s = fc[spot];
  if (!s.epic && !s.legend) return fc;
  const legendAt = s.legendAt > 0 ? s.legendAt
    : FIRST_CATCH_LEGEND_MIN + Math.floor(rng() * (FIRST_CATCH_LEGEND_MAX - FIRST_CATCH_LEGEND_MIN + 1));
  const epic = s.epic && guaranteed?.rarity !== 'epic';
  const legend = s.legend && guaranteed?.rarity !== 'legendary';
  const nextSpot: FirstCatchSpot = epic || legend ? { n: s.n + 1, legendAt, epic, legend } : endedFirstCatchSpot();
  return { ...fc, [spot]: nextSpot };
}
