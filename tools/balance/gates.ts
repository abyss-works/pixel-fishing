// 게이트 판정 — 이동 직후 수입(새 해역 진입 레벨의 방치 수입이 같은 레벨로 낚을 수 있는 이전 해역 중 가장 좋은 값 이상),
// PERFECT 이상치, 배 명성 대기 ÷ 골드 대기, 최초 10분 도달, 전환 시간의 목표 판정(범위와 순서).
// 판정 함수와 알려진 예외 목록의 단일 원천이다. 게이트 테스트와 흐름 도구의 gates 명령이 함께 쓴다.
import { SPOTS } from '../../src/game/content/spots';
import type { SpotId } from '../../src/game/content/spots';
import { moveGap } from './model';
import type { Pool } from './model';

/** 게이트를 보기 시작하는 해역 — 이 해역으로 옮기는 전환부터 마지막 해역까지 센다 */
export const GATE_FROM_SPOT: SpotId = 'sea';

export const GATE_POOLS: readonly Pool[] = ['day', 'mixed'];

/** 확정 밸런스의 알려진 역전, 관측 이슈로 추적한다. 값은 해역별 이동 직후 수입 차이(새 해역 - 비교 해역)다 */
export const KNOWN_INVERSIONS: Partial<Record<SpotId, Record<Pool, number>>> = {
  barrierreef: { day: -604.36, mixed: -577.26 },
  southindian: { day: -3989.26, mixed: -6374.33 },
  comorodeep: { day: -42614.75, mixed: -60618.06 },
};

/** 알려진 역전과 같다고 보는 차이 허용 오차(골드/시간). 목록 값은 소수 둘째 자리까지 적는다 */
export const GATE_TOLERANCE = 0.5;

/** 통과: 목록에 없고 차이 0 이상. 예외: 목록에 있고 알려진 값과 같음. 개선: 목록에 있고 알려진 값보다 좋아짐(목록 갱신 필요).
 *  위반: 목록에 없는데 차이가 0 미만이거나, 목록에 있는데 알려진 값보다 나빠짐 */
export type GateVerdict = '통과' | '예외' | '개선' | '위반';

/** (해역, 풀) 하나의 판정 */
export function judgeGate(spot: SpotId, pool: Pool, diff: number): GateVerdict {
  const known = KNOWN_INVERSIONS[spot]?.[pool];
  if (known === undefined) return diff >= 0 ? '통과' : '위반';
  if (Math.abs(diff - known) < GATE_TOLERANCE) return '예외';
  return diff > known ? '개선' : '위반';
}

export interface GateRow {
  spot: SpotId;
  pool: Pool;
  /** 비교 해역(같은 레벨로 낚을 수 있는 이전 해역 중 가장 좋은 곳). 없으면 undefined */
  from: SpotId | undefined;
  /** 이동 전 수입(비교 해역의 방치 시간당 골드) */
  before: number;
  /** 이동 직후 수입(새 해역의 방치 시간당 골드) */
  after: number;
  diff: number;
  verdict: GateVerdict;
}

/** 시작 해역부터 마지막 해역까지 전환마다, 풀(낮, 낮밤 혼합)마다 한 줄 */
export function gateRows(): GateRow[] {
  const start = SPOTS.findIndex(s => s.id === GATE_FROM_SPOT);
  const rows: GateRow[] = [];
  for (let i = start; i < SPOTS.length; i++) {
    const spot = SPOTS[i].id;
    for (const pool of GATE_POOLS) {
      const g = moveGap(i, pool);
      const verdict = judgeGate(spot, pool, g.diff);
      rows.push({ spot, pool, from: g.from, before: g.fromGold, after: g.gold, diff: g.diff, verdict });
    }
  }
  return rows;
}

// ── 기준을 넘는 정도로 판정하는 게이트 ──
// 값은 소수 둘째 자리로 맞춰 비교한다(표에 찍히는 정밀도). 기준 안이면 0이고, 알려진 예외는 그 값의 초과 정도와 비교한다.

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 기준을 넘은 정도(excess, 안이면 0)를 알려진 값의 초과 정도와 견줘 판정한다 */
function judgeExcess(excess: number, knownExcess: number | undefined): GateVerdict {
  const ex = Math.max(0, round2(excess));
  if (knownExcess === undefined) return ex === 0 ? '통과' : '위반';
  const known = Math.max(0, round2(knownExcess));
  if (ex === known) return '예외';
  return ex < known ? '개선' : '위반';
}

/** PERFECT 이상치 — 같은 해역, 같은 낚싯대 스펙에서 PERFECT의 시간당 골드가 방치의 이 배수를 넘지 않는다 */
export const PERFECT_LIMIT = 10;

export const judgePerfect = (ratio: number): GateVerdict => judgeExcess(round2(ratio) - PERFECT_LIMIT, undefined);

/** 배 명성 대기 ÷ 골드 대기 상한 — 리프 이후 배를 사는 전환에 적용하고 하한은 두지 않는다 */
export const FAME_RATIO_LIMIT = 1.3;

/** 알려진 예외: 전환 도착 해역별 비율의 현재 값 */
export const KNOWN_FAME_RATIO: Partial<Record<SpotId, number>> = {
  southindian: 1.33,
};

/** ratio는 명성 대기 ÷ 골드 대기이고, 골드 대기가 0이라 정해지지 않으면 null이다(이때 명성 대기가 있으면 위반) */
export function judgeFameRatio(spot: SpotId, ratio: number | null, fameWait = 0): GateVerdict {
  if (ratio === null) return fameWait > 0 ? '위반' : '통과';
  const known = KNOWN_FAME_RATIO[spot];
  return judgeExcess(round2(ratio) - FAME_RATIO_LIMIT, known === undefined ? undefined : round2(known) - FAME_RATIO_LIMIT);
}

/** 최초 10분 도달 — 새 계정이 수동 낚시로 첫 바다 해역에 닿는 목표 시간(초) */
export const OPENING_LIMIT_SEC = 600;

/** seconds는 도착 시간이고, 닿지 못했으면 null이다 */
export const judgeOpening = (seconds: number | null): GateVerdict =>
  judgeExcess(seconds === null ? Number.POSITIVE_INFINITY : seconds - OPENING_LIMIT_SEC, undefined);

// ── 전환 시간의 목표 판정 ──

/** 목표 판정을 시작하는 전환의 출발 해역 — 이 해역에서 나가는 전환부터 센다. 이 앞의 전환은 시간만 관측한다 */
export const TIME_GATE_FROM_SPOT: SpotId = 'barrierreef';

/** 지역 진입 전환의 목표 범위(시간). 키는 들어가는 지역(최상위 존)이다. 같은 지역 안의 전환은 목표 식이 정해지지 않아 범위를 판정하지 않는다 */
export const REGION_ENTRY_TARGET = {
  indian: [3, 4],
  madagascar: [9, 10],
  southatlantic: [25, 27],
} as const satisfies Record<string, readonly [number, number]>;

/** 알려진 예외: 도착 해역별 지역 진입 전환 시간의 현재 값(시간) */
export const KNOWN_TIME_RANGE: Partial<Record<SpotId, number>> = {
  indian: 1.27,
  mozstrait: 5.97,
  benguela: 22.85,
};

/** 알려진 예외: 도착 해역별 전환 시간이 직전 전환보다 줄어든 폭의 현재 값(시간) */
export const KNOWN_TIME_ORDER: Partial<Record<SpotId, number>> = {
  sthelena: 6.98,
};

const outsideBy = (hours: number, [lo, hi]: readonly [number, number]) => (hours < lo ? lo - hours : hours > hi ? hours - hi : 0);

export function judgeTimeRange(spot: SpotId, range: readonly [number, number], hours: number): GateVerdict {
  const known = KNOWN_TIME_RANGE[spot];
  return judgeExcess(outsideBy(round2(hours), range), known === undefined ? undefined : outsideBy(round2(known), range));
}

/** 전환 시간은 진행 순서로 줄어들지 않아야 한다. prev는 직전 전환의 시간이다 */
export function judgeTimeOrder(spot: SpotId, hours: number, prev: number): GateVerdict {
  return judgeExcess(round2(prev) - round2(hours), KNOWN_TIME_ORDER[spot]);
}
