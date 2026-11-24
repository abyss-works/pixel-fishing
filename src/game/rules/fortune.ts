// 운세 — 하루(게임 날짜, KST 04:00 경계) 하나의 작은 행운 보너스. 페널티는 없다.
// 서버가 게임 날짜마다 계정당 운세 하나를 굴려 상태에 고정한다 — 그날 안에서는
// 바뀌지 않고, 다시 접속하거나 기기를 바꿔도 같다(낙관 락이 첫 확정을 하나로 만든다).
// 운세 종류가 정한 대상의 판정에서 다른 보너스(업적·요리·길드·유물)를 다 적용한
// 마지막에 운 배율(1 + 지수/100)을 곱한다. "운"을 표방하는 다른 출처가 늘어나도
// 같은 운 배율에 더하고, 대상별 적용 지점은 바뀌지 않는다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.
import { gameDayOf } from './time.js';

/** 운세 종류 — 보너스가 걸리는 대상을 정한다. id는 writer 산출물 확정 전의 작업명 */
export type FortuneKind = 'fish' | 'gold' | 'shadow';

/** 운 배율이 걸리는 판정 대상 — 운세 종류와 1:1로 짝지어진다 */
export type FortuneTarget = 'rarity' | 'sell' | 'named';

/** 하루의 운세 — 굴린 게임 날짜에 고정된다 */
export interface DailyFortune {
  /** 굴린 게임 날짜 — 이 날짜 동안에만 이 운세가 산다 */
  day: string;
  kind: FortuneKind;
  /** 보너스 크기 — 3(적당한 운, 40%)과 5(좋은 운, 60%) 둘뿐이라 보너스 없는 날은 없다 */
  index: 3 | 5;
}

/** 운세 종류 → 보너스 대상 */
const TARGET_OF: Record<FortuneKind, FortuneTarget> = {
  fish: 'rarity',   // 물고기 운 — 희귀 이상 등급 가중치
  gold: 'sell',     // 돈 운 — 판매가
  shadow: 'named',  // 그림자 운 — 네임드 조우 가중치
};

/**
 * 운세 추첨 — 종류(rng 1회)와 지수(rng 1회)를 순서대로 뽑아 게임 날짜를 새겨 돌려준다.
 * 종류는 균등(1/3씩), 지수는 3이 40%·5가 60%다.
 */
export function rollFortune(day: string, rng: () => number = Math.random): DailyFortune {
  const kind = (['fish', 'gold', 'shadow'] as const)[Math.min(2, Math.floor(rng() * 3))];
  const index: 3 | 5 = rng() < 0.4 ? 3 : 5;
  return { day, kind, index };
}

/**
 * 오늘의 운세 보장 — 상태에 이 게임 날짜의 운세가 없으면 굴려 고정한다.
 * 이미 그날의 운세면 같은 상태를 돌려준다(불변 — rng를 쓰지 않는다).
 * 판정(catch·sell)이 처음 도는 순간이 굴리는 시점이다.
 */
export function ensureFortune<T extends { fortune: DailyFortune | null }>(
  state: T, nowIso: string, rng: () => number = Math.random,
): T {
  const day = gameDayOf(nowIso);
  return state.fortune?.day === day ? state : { ...state, fortune: rollFortune(day, rng) };
}

/** 지금 게임 날짜의 운세 — 날짜가 지난 운세는 없는 것으로 본다 */
export function fortuneOf(state: { fortune: DailyFortune | null }, nowIso: string): DailyFortune | null {
  return state.fortune?.day === gameDayOf(nowIso) ? state.fortune : null;
}

/**
 * 대상에 걸리는 운 배율 — 운세 종류가 그 대상을 가리키면 1 + 지수/100, 아니면 1.
 * 판정에서 다른 보너스를 다 적용한 마지막 곱이다.
 */
export function luckMultOf(fortune: DailyFortune | null, target: FortuneTarget): number {
  return fortune !== null && TARGET_OF[fortune.kind] === target ? 1 + fortune.index / 100 : 1;
}

/** 세이브 위생 — 운세는 하루짜리라 필드가 없는(구) 세이브는 없는 것으로 둔다.
 *  형태가 틀린 값은 버린다 — 다음 판정에서 다시 굴리면 된다 */
export function safeFortune(v: unknown): DailyFortune | null {
  const r = v as Partial<DailyFortune> | null;
  if (typeof r !== 'object' || r === null || Array.isArray(r)) return null;
  if (typeof r.day !== 'string' || r.day.length === 0) return null;
  if (r.kind !== 'fish' && r.kind !== 'gold' && r.kind !== 'shadow') return null;
  if (r.index !== 3 && r.index !== 5) return null;
  return { day: r.day, kind: r.kind, index: r.index };
}
