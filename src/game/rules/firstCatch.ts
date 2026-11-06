// 새 계정 첫 경험 보장 — 계정의 5번째 캐치에서 영웅 한 마리, 서버가 계정마다 한 번 정한
// 10~20번째 캐치에서 전설 한 마리를 잡게 한다. 어종은 그 캐치가 일어난 수역의 해당 등급 어종이다.
// 계정당 한 번이며 진척은 화면에 보이지 않는다. 보장이 만든 캐치도 이후 흐름은 일반 캐치와 같다.
// 리듀서 catch와 서버 fast path가 drawCatch를 거쳐 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { fishPool } from './logic.js';
import type { DayPhase } from './time.js';
import type { SpotId } from '../content/spots.js';
import type { Fish } from '../content/fish.js';

/** 영웅이 나오는 계정 캐치 번호 */
export const FIRST_CATCH_EPIC_AT = 5;
/** 전설이 나오는 캐치 번호의 범위(양끝 포함) */
export const FIRST_CATCH_LEGEND_MIN = 10;
export const FIRST_CATCH_LEGEND_MAX = 20;

export interface FirstCatch {
  /** 보장이 진행되는 동안 센 계정 캐치 수. 끝나면 더 세지 않는다 */
  n: number;
  /** 전설이 나올 캐치 번호. 0 = 아직 정하지 않음(첫 캐치에서 서버가 정한다) */
  legendAt: number;
  /** 영웅 보장이 남았는가 */
  epic: boolean;
  /** 전설 보장이 남았는가 */
  legend: boolean;
}

export const newFirstCatch = (): FirstCatch => ({ n: 0, legendAt: 0, epic: true, legend: true });
export const endedFirstCatch = (): FirstCatch => ({ n: 0, legendAt: 0, epic: false, legend: false });

/** 필드가 없는 이전 세이브의 판정 — 캐치가 하나도 없는 계정(도감이 비고 명성 0)만 보장 대상이다.
 *  명성은 줄지 않고 캐치로만 쌓이므로, 도감을 들고 있지 않은 서버 경로도 같은 판정을 한다 */
export const firstCatchOfLegacy = (dexCatches: number, fame: number): FirstCatch =>
  dexCatches === 0 && fame === 0 ? newFirstCatch() : endedFirstCatch();

/** 이번 캐치(n+1번째)가 보장 대상이면 그 수역·시간대 풀에서 해당 등급 어종을 고른다.
 *  풀에 그 등급 어종이 없으면 null — 보장은 남고 다음 캐치로 미뤄진다.
 *  전설 번호가 지나도록 못 받았으면 번호를 넘긴 첫 가능한 캐치에서 받는다. 전설을 먼저 본다.
 *  어종을 고를 때 rng를 한 번 쓴다(통상 추첨을 대신하는 자리) */
export function firstCatchTarget(fc: FirstCatch, spot: SpotId, phase: DayPhase, rng: () => number): Fish | null {
  const no = fc.n + 1;
  const due = [
    ...(fc.legend && fc.legendAt > 0 && no >= fc.legendAt ? ['legendary' as const] : []),
    ...(fc.epic && no >= FIRST_CATCH_EPIC_AT ? ['epic' as const] : []),
  ];
  for (const rarity of due) {
    const pool = fishPool(spot, phase).filter(f => f.rarity === rarity);
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)];
  }
  return null;
}

/** 캐치 결과 반영 — 수를 올리고, 첫 캐치에서 전설 번호를 정하며, 보장으로 잡은 등급의 몫을 닫는다.
 *  @param guaranteed 이번 캐치가 보장으로 고정된 어종이면 그 어종, 아니면 null */
export function settleFirstCatch(fc: FirstCatch, guaranteed: Fish | null, rng: () => number): FirstCatch {
  if (!fc.epic && !fc.legend) return fc;
  const legendAt = fc.legendAt > 0 ? fc.legendAt
    : FIRST_CATCH_LEGEND_MIN + Math.floor(rng() * (FIRST_CATCH_LEGEND_MAX - FIRST_CATCH_LEGEND_MIN + 1));
  const epic = fc.epic && guaranteed?.rarity !== 'epic';
  const legend = fc.legend && guaranteed?.rarity !== 'legendary';
  return epic || legend ? { n: fc.n + 1, legendAt, epic, legend } : endedFirstCatch();
}
